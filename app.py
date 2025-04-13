import asyncio
import json
import math
import os
import sys
import traceback

from typing import List, Tuple, Dict

from io import BytesIO


import requests
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from openai import RateLimitError
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
import numpy as np

import retriever

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from designer import Designer
from simple_retrieval import SimpleRetrieval

# Initialize retrieval system
retrieval_system = SimpleRetrieval()
try:
    retrieval_system.load_index()
    retrieval_system.load_faiss_index()
    print("Retrieval system initialized successfully")
except FileNotFoundError as e:
    print(f"Warning: {e}")
    print("Please run simple_retrieval.py first to create the necessary index files")

# Pydantic models for request validation
class DoorWindow(BaseModel):
    wall: str
    position: float
    width: float
    height: float

class RoomSpec(BaseModel):
    length: float  # in feet
    width: float   # in feet
    doors: List[DoorWindow]
    windows: List[DoorWindow]
    roomType: str
    style: str

class DesignItem(BaseModel):
    object: str
    start: Tuple[int, int]
    end: Tuple[int, int]
    item_id: str

class DesignResponse(BaseModel):
    items: List[DesignItem]

class QueryObject(BaseModel):
    material: str
    style: str
    key_items: str
    keywords: str
    user_conversation: str

class RetrievalQuery(BaseModel):
    query_object: QueryObject
    k: int = 10

class RetrievalResponse(BaseModel):
    items: List[Dict[str, float]]

class SimilarItem(BaseModel):
    item_id: str
    description: str


app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_room_grid_image(room_spec: RoomSpec) -> BytesIO:
    """
    Creates a grid image of the room specified by `room_spec` with labels.
    Returns a BytesIO object containing the image data.
    
    Color legend:
      - Walls (outer boundary): Gray with label "wall"
      - Interior: White (no label)
      - Doors & Windows: Red with labels "door" or "window"
      - Grid lines: Black
    Each cell is treated as 1 ft x 1 ft.
    """
    
    # Determine grid dimensions (each cell is 1 ft x 1 ft)
    rows = int(math.ceil(room_spec.width))  # vertical cells
    cols = int(math.ceil(room_spec.length))     # horizontal cells
    
    # Set cell pixel size and margin (for axis labels)
    cell_size = 50
    margin = cell_size  # margin for axis numbers
    offset_x = margin
    offset_y = margin
    
    # New image dimensions include the margins.
    img_width = cols * cell_size + offset_x
    img_height = rows * cell_size + offset_y
    
    # Define colors
    COLOR_WALL = (128, 128, 128)         # Gray
    COLOR_INTERIOR = (255, 255, 255)     # White
    COLOR_DOOR_WINDOW = (255, 0, 0)        # Red
    COLOR_GRID = (0, 0, 0)               # Black
    
    # Create a new image with a white background.
    image = Image.new("RGB", (img_width, img_height), COLOR_INTERIOR)
    draw = ImageDraw.Draw(image)
    
    # 2D list to keep track of labels per cell.
    cell_labels = [['' for _ in range(cols)] for _ in range(rows)]
    
    # 1) Draw the outer wall cells (offset by margin) in gray and label them as "wall"
    for r in range(rows):
        for c in range(cols):
            if r == 0 or r == rows - 1 or c == 0 or c == cols - 1:
                x1 = offset_x + c * cell_size
                y1 = offset_y + r * cell_size
                x2 = x1 + cell_size
                y2 = y1 + cell_size
                draw.rectangle([x1, y1, x2, y2], fill=COLOR_WALL, outline=COLOR_GRID)
                cell_labels[r][c] = "wall"
    
    # Fill the interior cells (if any) with white (they remain unlabeled)
    for r in range(1, rows - 1):
        for c in range(1, cols - 1):
            x1 = offset_x + c * cell_size
            y1 = offset_y + r * cell_size
            x2 = x1 + cell_size
            y2 = y1 + cell_size
            draw.rectangle([x1, y1, x2, y2], fill=COLOR_INTERIOR, outline=COLOR_GRID)
    
    # 2) Helper function: given a DoorWindow, compute the grid cells it should occupy.
    def get_cells_for_dw(dw: DoorWindow) -> List[tuple]:
        cells = []
        wall = dw.wall.lower()
        door_width = int(round(dw.width))
        door_height = 1
        
        # For north and south walls, the wall length is the number of columns.
        if wall in ["north", "south"]:
            total_cells = cols  # total cells along the wall
            center = int(round(dw.position * (total_cells - 1)))
            start = center - door_width // 2
            end = start + door_width
            if wall == "north":
                for c in range(start, end):
                    for h in range(door_height):
                        r = 0 + h  # extends downward from the top wall
                        if 0 <= c < cols and 0 <= r < rows:
                            cells.append((r, c))
            elif wall == "south":
                for c in range(start, end):
                    for h in range(door_height):
                        r = rows - 1 - h  # extends upward from the bottom wall
                        if 0 <= c < cols and 0 <= r < rows:
                            cells.append((r, c))
        # For east and west walls, the wall length is the number of rows.
        elif wall in ["east", "west"]:
            total_cells = rows  # total cells along the wall
            center = int(round(dw.position * (total_cells - 1)))
            start = center - door_width // 2
            end = start + door_width
            if wall == "west":
                for r in range(start, end):
                    for h in range(door_height):
                        c = 0 + h  # extends rightward from the left wall
                        if 0 <= c < cols and 0 <= r < rows:
                            cells.append((r, c))
            elif wall == "east":
                for r in range(start, end):
                    for h in range(door_height):
                        c = cols - 1 - h  # extends leftward from the right wall
                        if 0 <= c < cols and 0 <= r < rows:
                            cells.append((r, c))
        return cells

    # 3) Draw door/window cells in red and label them accordingly.
    def apply_door_window(dw: DoorWindow, label: str):
        for (r, c) in get_cells_for_dw(dw):
            x1 = offset_x + c * cell_size
            y1 = offset_y + r * cell_size
            x2 = x1 + cell_size
            y2 = y1 + cell_size
            draw.rectangle([x1, y1, x2, y2], fill=COLOR_DOOR_WINDOW, outline=COLOR_GRID)
            cell_labels[r][c] = label

    for door in room_spec.doors:
        apply_door_window(door, "door")
    
    for window in room_spec.windows:
        apply_door_window(window, "window")
    
    # 4) Draw grid lines over the entire grid area.
    for r in range(rows + 1):
        start = (offset_x, offset_y + r * cell_size)
        end = (offset_x + cols * cell_size, offset_y + r * cell_size)
        draw.line([start, end], fill=COLOR_GRID)
    for c in range(cols + 1):
        start = (offset_x + c * cell_size, offset_y)
        end = (offset_x + c * cell_size, offset_y + rows * cell_size)
        draw.line([start, end], fill=COLOR_GRID)
    
    # 5) Draw labels in the center of each cell.
    try:
        # Attempt to use a truetype font (Arial) if available.
        font = ImageFont.truetype("arial.ttf", size=14)
    except IOError:
        font = ImageFont.load_default()
    
    for r in range(rows):
        for c in range(cols):
            text = cell_labels[r][c]
            if text:
                center_x = offset_x + c * cell_size + cell_size / 2
                center_y = offset_y + r * cell_size + cell_size / 2
                # Use textbbox to compute the text size.
                bbox = draw.textbbox((0, 0), text, font=font)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                text_color = (255, 255, 255) if text == "wall" else (0, 0, 0)
                draw.text((center_x - text_width / 2, center_y - text_height / 2),
                          text, font=font, fill=text_color)
    
    # For x axis (columns):
    for c in range(cols):
        index_text = str(c)
        # Compute text dimensions
        bbox = draw.textbbox((0, 0), index_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        # Center the text in the top margin for this column.
        center_x = offset_x + c * cell_size + cell_size / 2
        # Place the text in the middle of the top margin.
        x_text = center_x - text_width / 2
        y_text = (margin - text_height) / 2
        draw.text((x_text, y_text), index_text, font=font, fill=COLOR_GRID)
    
    # For y axis (rows):
    for r in range(rows):
        index_text = str(r)
        bbox = draw.textbbox((0, 0), index_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        # Center the text in the left margin for this row.
        center_y = offset_y + r * cell_size + cell_size / 2
        x_text = (margin - text_width) / 2
        y_text = center_y - text_height / 2
        draw.text((x_text, y_text), index_text, font=font, fill=COLOR_GRID)

    # Save to BytesIO instead of file
    img_io = BytesIO()
    image.save(img_io, format='PNG')
    img_io.seek(0)
    return img_io

@app.post("/retrieve-items", response_model=RetrievalResponse)
async def retrieve_items(query: RetrievalQuery):
    try:
        # Get results using the query object
        results = await retrieval_system.retrieve_with_query_object(
            query.query_object.dict(),
            k=query.k
        )
        
        # Format results
        items = [{"item_id": item_id, "score": score} for item_id, score in results]
        
        return {"items": items}
        
    except RateLimitError as e:
        print(f"Rate limit reached: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=429, detail="OpenAI API rate limit reached. Please try again later.")
    except Exception as e:
        print(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-design", response_model=DesignResponse)
async def generate_design(room_spec: RoomSpec):
    try:
        # Convert room dimensions to grid dimensions (1 foot = 1 cell)
        num_rows = int(room_spec.width)
        num_cols = int(room_spec.length)
        
        # Create the room image with constraints
        img_io = create_room_grid_image(room_spec)
        
        # Convert door and window positions to grid constraints
        constraints = []
        
        # Convert doors to constraints
        for door in room_spec.doors:
            wall = door.wall
            position = door.position
            width = door.width
            
            # Convert wall position to grid coordinates
            if wall == 'north':
                start = (0, int(position * num_cols - width/2))
                end = (0, min(num_cols - 1, int((position + width/room_spec.length) * num_cols - width/2)))
            elif wall == 'south':
                start = (num_rows - 1, int(position * num_cols - width/2))
                end = (num_rows - 1, min(num_cols - 1, int((position + width/room_spec.length) * num_cols - width/2)))
            elif wall == 'east':
                start = (int(position * num_rows - width/2), num_cols - 1)
                end = (min(num_rows - 1, int((position + width/room_spec.width) * num_rows - width/2)), num_cols - 1)
            else:  # west
                start = (int(position * num_rows - width/2), 0)
                end = (min(num_rows - 1, int((position + width/room_spec.width) * num_rows - width/2)), 0)
            
            constraints.append({
                "object": "Door",
                "start": start,
                "end": end
            })
        
        # Convert windows to constraints
        for window in room_spec.windows:
            wall = window.wall
            position = window.position
            width = window.width
            
            if wall == 'north':
                start = (0, int(position * num_cols - width/2))
                end = (0, min(num_cols - 1, int((position + width/room_spec.length) * num_cols - width/2)))
            elif wall == 'south':
                start = (num_rows - 1, int(position * num_cols - width/2))
                end = (num_rows - 1, min(num_cols - 1, int((position + width/room_spec.length) * num_cols - width/2)))
            elif wall == 'east':
                start = (int(position * num_rows - width/2), num_cols - 1)
                end = (min(num_rows - 1, int((position + width/room_spec.width) * num_rows - width/2)), num_cols - 1)
            else:  # west
                start = (int(position * num_rows - width/2), 0)
                end = (min(num_rows - 1, int((position + width/room_spec.width) * num_rows - width/2)), 0)
            
            constraints.append({
                "object": "Window",
                "start": start,
                "end": end
            })
        
        # Initialize and run the designer
        designer = Designer(
            room_dimensions=(num_rows, num_cols),
            scene_image=img_io,
            constraints=constraints,
            requirement=room_spec.roomType,
            verbose=True
        )
        
        design = await designer.run_with_style(room_spec.style)
        
        return {"items": design}

    except RateLimitError as e:
        print(f"Rate limit reached: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=429, detail="OpenAI API rate limit reached. Please try again later.")
    except Exception as e:
        print(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-similar-items", response_model=List[SimilarItem])
async def get_similar_items(item_id: str):
    """
    Get similar items from the database.
    """
    try:
        return await retriever.get_similar_items(item_id)
    except RateLimitError as e:
        print(f"Rate limit reached: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=429, detail="OpenAI API rate limit reached. Please try again later.")
    except Exception as e:
        print(e)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/s3-proxy/{item_id}")
async def s3_proxy(item_id: str):
    """
    Proxy endpoint to fetch 3D models from S3 bucket and handle CORS.
    """
    s3_url = f"https://interior-data.s3.amazonaws.com/{item_id}.glb"
    try:
        response = await asyncio.to_thread(requests.get, s3_url)
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch model from S3")
        
        # Return the content with appropriate headers
        return Response(
            content=response.content,
            media_type="model/gltf-binary",
            headers={
                "Content-Disposition": f"attachment; filename={item_id}.glb"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching model: {str(e)}")

@app.get("/s3-proxy/{item_id}/thumbnail")
async def s3_proxy_thumbnail(item_id: str):
    """
    Proxy endpoint to fetch thumbnail images for 3D models from S3 bucket and handle CORS.
    """
    # Try to get thumbnail from S3 with different extensions
    extensions = ['jpg', 'png', 'jpeg']
    
    for ext in extensions:
        s3_url = f"https://interior-data.s3.amazonaws.com/thumbnails/{item_id}.{ext}"
        try:
            response = await asyncio.to_thread(requests.get, s3_url)
            if response.status_code == 200:
                # Determine content type based on extension
                content_type = f"image/{ext}"
                if ext == 'jpg':
                    content_type = "image/jpeg"
                
                # Return the content with appropriate headers
                return Response(
                    content=response.content,
                    media_type=content_type
                )
        except Exception:
            continue
    
    # If no thumbnail found with any extension, return a 404
    raise HTTPException(status_code=404, detail="Thumbnail not found")

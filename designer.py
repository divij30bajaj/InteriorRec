import json
import math
import os
from io import BytesIO

import matplotlib.image as mpimg
import matplotlib.patches as patches
import matplotlib.pyplot as plt
import numpy as np
import tqdm
from PIL import Image

from model import Model
from retriever import simple_retriever
from utils import extract_info

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
class Designer:
    def __init__(self, room_dimensions, scene_image, constraints, requirement, verbose=False):
        self.model = Model(key=OPENAI_API_KEY)
        self.num_rows = room_dimensions[0]
        self.num_cols = room_dimensions[1]
        self.scene_image = scene_image  # Now a BytesIO object
        self.requirement = requirement
        self.constraints = constraints

        self.verbose = verbose

        # Initialize in-memory image buffers instead of file paths
        self.intermediate_image = BytesIO()
        self.final_image = BytesIO()
        
        # Initial image data is the scene image
        self.scene_image.seek(0)
        self.scene_array = np.array(Image.open(self.scene_image))
        
        self.list_of_objects = []
        self.design = []
    
    def place_object(self, box, name, source_image, target_buffer):
        """
        Places an object on the room image.
        
        Parameters:
        - box: Tuple (col_start, row_start, col_end, row_end) of the object's position
        - name: Name of the object to place
        - source_image: BytesIO object or numpy array of the source image
        - target_buffer: BytesIO object to store the resulting image
        """
        # Reset the source_image if it's a BytesIO object
        if isinstance(source_image, BytesIO):
            source_image.seek(0)
            image_array = np.array(Image.open(source_image))
        elif isinstance(source_image, np.ndarray):
            image_array = source_image
        else:
            # If it's a file path (for backward compatibility)
            image_array = mpimg.imread(source_image)

        cell_col = image_array.shape[1] // (self.num_cols+1)
        cell_row = image_array.shape[0] // (self.num_rows+1)

        bbox = ((box[0]+1) * cell_col, (box[1]+1) * cell_row, (box[2] - box[0]) * cell_col, (box[3] - box[1]) * cell_row)
        
        print("placing object", box, name, bbox)
        fig, ax = plt.subplots()

        if target_buffer == self.intermediate_image:
            facecolor = 'green'
        else:
            facecolor = 'red'

        rect = patches.Rectangle(
            (bbox[0], bbox[1]), bbox[2], bbox[3],
            linewidth=3, edgecolor='black', facecolor=facecolor
        )
        ax.add_patch(rect)

        padding = 5
        ax.text(
            bbox[0] + padding,
            bbox[1] + padding,
            name,
            fontsize=10,
            color='yellow',
            verticalalignment='top',
        )

        ax.axis('off')
        plt.imshow(image_array)
        
        # Save to the target buffer instead of a file
        target_buffer.seek(0)
        target_buffer.truncate(0)  # Clear any existing content
        plt.savefig(target_buffer, format='png', bbox_inches='tight', pad_inches=0)
        plt.close(fig)  # Close the figure to avoid memory leaks
        
        # Reset buffer position for reading
        target_buffer.seek(0)

    async def understand_image_and_task(self):
        introductory = f"""You are an seasoned interior designer. Given this layout of a room. The surrounding gray area is marked as walls and the red blocks
        denote the door and windows. Given the following requirements, I want to design an **aesthetically pleasing {self.requirement}**. 
        The cells highlighted in color (walls, door, window) are blocked and cannot be used to keep any items. First, list the furniture items 
        (not bedding, vase etc.) to be placed in the room, sorted by their size in decreasing order.
        Keep in mind that I will ask you to place these objects on the grid in 
        later prompts. Just list the furniture items in sorted order in the JSON format and nothing else: [{{'name': 'name of the furniture', 'description': 'a short description'}}, ...] """

        response = await self.model.query(introductory, self.scene_image)
        if self.verbose:
            print("understand_image_and_task - Input:", introductory)
            print("understand_image_and_task - Output:", response)

        response = response.replace("```json", "").replace("```", "").strip()
        self.list_of_objects = json.loads(response)

        if self.verbose:
            print("list_of_objects:", self.list_of_objects)

    def detect_overlap(self, blocked_regions, placed_region):
        blocked_cells = []
        for region in blocked_regions[:-1]:
            if region.split(":")[0] == "Walls":
                cells = list(range(self.num_cols)) + \
                        list(range(0, self.num_cols*self.num_rows, self.num_cols)) + \
                        list(range(self.num_cols-1, self.num_rows*self.num_cols, self.num_cols)) + \
                        list(range((self.num_rows-1)*self.num_cols, self.num_cols*self.num_rows))
                cells = list(set(cells))
                blocked_cells.extend(cells)
                continue
            row, col = region.split(",")[0].split(":")[1].strip(), region.split(",")[1].strip()
            row_tokens, col_tokens = row.split(), col.split()
            if len(row_tokens) == 4:
                row_start = int(row_tokens[1])
                row_end = int(row_tokens[3])
            else:
                row_start = int(row_tokens[1])
                row_end = row_start + 1

            if len(col_tokens) == 4:
                col_start = int(col_tokens[1])
                col_end = int(col_tokens[3])
            else:
                col_start = int(col_tokens[1])
                col_end = col_start + 1

            object_cells = []
            for row in range(row_start, row_end):
                cell_start = row*self.num_cols + col_start
                cell_end = row*self.num_cols + col_end
                cells = list(range(cell_start, cell_end))
                object_cells.extend(cells)

            blocked_cells.extend(object_cells)

        placed_col_start, placed_row_start, placed_col_end, placed_row_end = placed_region
        object_cells = []
        for row in range(placed_row_start, placed_row_end):
            cell_start = row * self.num_cols + placed_col_start
            cell_end = row * self.num_cols + placed_col_end
            cells = list(range(cell_start, cell_end))
            object_cells.extend(cells)

        return len(set(blocked_cells).intersection(set(object_cells))) > 0

    async def run_rule_based_critic(self, name, blocked_cells, item_id, length, width):
        critic_prompt = f"""The current placement of the {name} (shown in green) overlaps with one or more of the 
        blocked cells. Give another set of cells and orientation for the green block in the below format:\nGRID: <Start row number>, <Start column number>\nORIENTATION: 
        <Orientation of the {name}>."""
        critic_response = await self.model.query(critic_prompt, self.intermediate_image)
        if self.verbose:
            print("critic_response - Input:", critic_prompt)
            print("critic_response - Output:", critic_response)
        start_row, start_col, orientation = extract_info(critic_response)
        end_col, end_row = (start_col + width, start_row + length) if orientation.lower() == "vertical" else (
        start_col + length, start_row + width)

        row_str = f"Rows {start_row} to {end_row}" if start_row != end_row else f"Rows {start_row}"
        col_str = f"Columns {start_col} to {end_col}" if start_col != end_col else f"Columns {start_col}"
        blocked_cells.append(f"{name}: {row_str}, {col_str}")
        self.design.pop()
        self.design.append(
            {"object": name, "start": (start_row, start_col), "end": (end_row, end_col), "item_id": item_id})
        return start_col, start_row, end_col, end_row

    async def run_critic(self, name, source_image, item_id, length, width):
        critic_prompt = f"""You are an seasoned interior designer who corrects the placement of the furniture. 
        Look at the green box on the grid, which is the current placement of the {name}. Ensure, that room space is 
        utilized properly and no doors are blocked. Now do you 
        think this grid position does not overlap with any of the blocked cell? Overlapping DOES NOT mean when one 
        edge is common. If the green block is superimposed over any blocked cell, give another set of cells and 
        orientation for the green block in the below format:\nGRID: <Start row number>, <Start column 
        number>\nORIENTATION: <Orientation of the {name}>. If current position is good, output the same position 
        again. """
        critic_response = await self.model.query(critic_prompt, self.intermediate_image)
        if self.verbose:
            print("critic_response - Input:", critic_prompt)
            print("critic_response - Output:", critic_response)
        start_row, start_col, orientation = extract_info(critic_response)
        end_col, end_row = (start_col + width, start_row + length) if orientation.lower() == "vertical" else (start_col + length, start_row + width)

        self.design.append({"object": name, "start": (start_row, start_col), "end": (end_row, end_col), "item_id": item_id})
        self.place_object((start_col, start_row, end_col, end_row), name, source_image, self.final_image)

    async def add_objects(self):
        blocked_cells = [f"Walls: Entire Rows 1, Rows {self.num_rows - 1}, Columns 1, Columns {self.num_cols - 1}"]
        for constraint in self.constraints:
            object = constraint["object"]
            start = constraint["start"]
            end = constraint["end"]

            row_str = f"Rows {start[0]} to {end[0]}" if start[0] != end[0] else f"Rows {start[0]}"
            col_str = f"Columns {start[1]} to {end[1]}" if start[1] != end[1] else f"Columns {start[1]}"

            blocked_cells.append(f"{object}: {row_str}, {col_str}")

        for i, obj in tqdm.tqdm(enumerate(self.list_of_objects)):
            name = obj["name"]
            description = obj["description"]
            retrieved_object = await simple_retriever(description)
            retrieved_object = retrieved_object[0][0]

            # Convert dimensions from inches to grid cells (12 inches = 1 foot = 1 cell)
            length = math.ceil(retrieved_object["dimensions"]["length"]/12)  # Convert inches to feet (cells)
            width = math.ceil(retrieved_object["dimensions"]["width"]/12)    # Convert inches to feet (cells)
            
            print("retrieved_object: ", retrieved_object["item_id"], retrieved_object["dimensions"], length, width)
            iterative_prompt = f"""You are an seasoned interior designer who is great at creating the best interior designs by placing the furnitures
            at their best places according to the requirements and furniture already placed. We want to place the {name} in the room.
            The {name} is {length} cells long and {width} cells wide respectively.
            The cells blocked because of already placed furniture until now are: {blocked_cells}\nThen, output your logic to place the {name} by not including any cells that are in 
            the blocked list. In the end, write the following in 2 different lines and nothing else:\nGRID: <Start row number>, 
            <start column number>\nORIENTATION: <Orientation of the {name}> """
            
            source_image = self.scene_image if i == 0 else self.final_image
            
            response = await self.model.query(iterative_prompt, source_image)
            if self.verbose:
                print("add_objects for ", name, " - Input:", iterative_prompt)
                print("add_objects for ", name, " - Output:", response)

            start_row, start_col, orientation = extract_info(response)
            end_col, end_row = (start_col + width, start_row + length) if orientation.lower() == "vertical" else (start_col + length, start_row + width)

            row_str = f"Rows {start_row} to {end_row}" if start_row != end_row else f"Rows {start_row}"
            col_str = f"Columns {start_col} to {end_col}" if start_col != end_col else f"Columns {start_col}"
            blocked_cells.append(f"{name}: {row_str}, {col_str}")

            box = (start_col, start_row, end_col, end_row)
            self.place_object(box, name, source_image, self.intermediate_image)

            is_overlapping = self.detect_overlap(blocked_cells, box)

            num_attempts = 0
            self.design.append({"object": name, "start": (start_row, start_col), "end": (end_row, end_col), "item_id": retrieved_object["item_id"]})
            while num_attempts < 3 and is_overlapping:
                print("Attempt {} - Overlapping object detected!\nBlocked cells: {}\nPlaced cells: {}".format(num_attempts+1, blocked_cells, box))
                blocked_cells.pop()
                box = await self.run_rule_based_critic(name, blocked_cells, retrieved_object["item_id"], length, width)
                is_overlapping = self.detect_overlap(blocked_cells, box)
                num_attempts += 1

                self.place_object(box, name, source_image, self.intermediate_image)
            self.place_object(box, name, source_image, self.final_image)
            # self.run_critic(name, image_path, retrieved_object["item_id"], length, width)

    def write_to_json(self, save_to_file=False):
        """
        Returns the design as a JSON object and optionally saves it to a file.
        
        Args:
            save_to_file: If True, saves the design to 'results/design.json'
            
        Returns:
            The design as a list of objects
        """
        if save_to_file:
            os.makedirs('results', exist_ok=True)
            if os.path.exists('results/design.json'):
                os.remove('results/design.json')
            with open('results/design.json', 'w') as f:
                json.dump(self.design, f)
        return self.design

    async def run(self):
        await self.understand_image_and_task()
        await self.add_objects()
        return self.write_to_json()

    async def run_with_style(self, style):
        self.requirement = style + " " + self.requirement
        await self.understand_image_and_task()
        await self.add_objects()
        return self.write_to_json()


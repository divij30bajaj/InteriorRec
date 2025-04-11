import base64
from io import BytesIO
from typing import Union

from constant import ITEM_DESCRIPTIONS


def extract_bbox(start_row, start_col, name):
    text_size = ITEM_DESCRIPTIONS[name]['size']
    width = int(text_size.split(",")[0].split(" ")[0])
    length = int(text_size.split(",")[1].split(" ")[1])

    end_row = start_row + length - 1
    end_col = start_col + width - 1

    return start_col, start_row, end_col, end_row


def extract_info(response):
    response_list = response.split("\n")
    grid_numbers = []
    orientation = ""
    for row in response_list:
        if "GRID" in row:
            grid_numbers = row.split(":")[1].strip().split(",")
        elif "ORIENTATION" in row:
            orientation = row.split(":")[1].strip()

    grid_numbers = [int(num) for num in grid_numbers]
    return grid_numbers[0], grid_numbers[1], orientation


def encode_image(image_path_or_io: Union[str, BytesIO]):
    """
    Encode an image to base64 string.
    
    Args:
        image_path_or_io: Either a file path or a BytesIO object containing the image
        
    Returns:
        A base64 encoded string of the image
    """
    if isinstance(image_path_or_io, BytesIO):
        # If it's a BytesIO object, read from it directly
        image_path_or_io.seek(0)
        return base64.b64encode(image_path_or_io.read()).decode('utf-8')
    else:
        # If it's a file path, open and read the file
        with open(image_path_or_io, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
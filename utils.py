import base64

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


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')
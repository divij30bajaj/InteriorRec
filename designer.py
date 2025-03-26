import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.image as mpimg
import os
import tqdm

from constant import ITEM_DESCRIPTIONS
from model import Model
from utils import extract_info, extract_bbox


class Designer:
    def __init__(self, room_dimensions, scene_image, constraints, requirement, verbose=False):
        self.model = Model(key="<YOUR-OPENAI-KEY>")
        self.num_rows = room_dimensions[0]
        self.num_cols = room_dimensions[1]
        self.scene_image = scene_image
        self.requirement = requirement
        self.constraints = constraints

        self.verbose = verbose

        self.intermediate_image = 'results/temp.png'
        self.final_image = 'results/final_design.png'
        if os.path.exists(self.intermediate_image):
            os.remove(self.intermediate_image)
        if os.path.exists(self.final_image):
            os.remove(self.final_image)

        self.list_of_objects = []
        self.design = []

    def place_object(self, box, name, image_path, output_path):
        image = mpimg.imread(image_path)

        cell_col = image.shape[1] // self.num_cols
        cell_row = image.shape[0] // self.num_rows

        bbox = (
            box[0] * cell_col, box[1] * cell_row, (box[2] - box[0] + 1) * cell_col, (box[3] - box[1] + 1) * cell_row)

        fig, ax = plt.subplots()

        if output_path == self.intermediate_image:
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
        plt.imshow(image)
        plt.savefig(output_path, bbox_inches='tight', pad_inches=0)

    def understand_image_and_task(self):
        initial_prompt = """This is an image of a room layout. Tell me everything you observe about the room."""
        response = self.model.query(initial_prompt, self.scene_image)
        if self.verbose:
            print(response)

        introductory = f"""Yes, the gray area is marked as walls and the red blocks denote the door and window. Given 
        this layout of a room, I want to design an **aesthetically pleasing {requirement}**. The cells highlighted in 
        color (walls, door, window) are blocked and cannot be used to keep any items. First, list the furniture items 
        (not bedding, vase etc.) to be placed in the room, sorted by their size in decreasing order. Remember the bed 
        is the biggest so it comes first. Keep in mind that I will ask you to place these objects on the grid in 
        later prompts. Just list the furniture in sorted order for now in a JSON format, with a list of items, 
        and each item is a dict with 2 keys: name of the furniture and a short description """

        response = self.model.query(introductory, self.scene_image)
        if self.verbose:
            print(response)

        response = response.replace("```json", "").replace("```", "").strip()
        self.list_of_objects = json.loads(response)

        if self.verbose:
            print(self.list_of_objects)

    def run_critic(self, name, image_path):
        critic_prompt = f"""Refer the list of blocked cells and the grid position from your last response. Now do you 
        think your grid position does not overlap with any of the blocked cell? Overlapping DOES NOT mean when one 
        edge is common. If the green block is superimposed over any blocked cell, give another set of cells and 
        orientation for the green block in the below format:\nGRID: <Start row number>, <Start column 
        number>\nORIENTATION: <Orientation of the {name}>. If current position is good, output the same position 
        again """
        critic_response = self.model.query(critic_prompt, self.intermediate_image)
        if self.verbose:
            print(critic_response)
        start_row, start_col, orientation = extract_info(critic_response)
        start_col, start_row, end_col, end_row = extract_bbox(start_row, start_col, name)

        self.design.append({"object": name, "start": (start_row, start_col), "end": (end_row, end_col)})
        self.place_object((start_col, start_row, end_col, end_row), name, image_path, self.final_image)

    def add_objects(self):
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
            iterative_prompt = f"""We want to place the {name} in the room. Refer the below dictionary for 
            aesthetic understanding of the {name}:\n{json.dumps(ITEM_DESCRIPTIONS[name])}\nPlace the {name} strictly 
            {ITEM_DESCRIPTIONS[name]['position']} taking no more than the size mentioned in the dictionary. The cells blocked 
            until now are: {blocked_cells}\nThen, output your logic to place the {name} by not including any cells that are in 
            the blocked list. In the end, write the following in 2 different lines and nothing else:\nGRID: <Start row number>, 
            <start column number>\nORIENTATION: <Orientation of the {name}> """
            if self.verbose:
                print(iterative_prompt)
            if i == 0:
                image_path = self.scene_image
            else:
                image_path = self.final_image
            response = self.model.query(iterative_prompt, image_path)
            if self.verbose:
                print(response)

            start_row, start_col, orientation = extract_info(response)
            start_col, start_row, end_col, end_row = extract_bbox(start_row, start_col, name)

            row_str = f"Rows {start_row} to {end_row}" if start_row != end_row else f"Rows {start_row}"
            col_str = f"Columns {start_col} to {end_col}" if start_col != end_col else f"Columns {start_col}"
            blocked_cells.append(f"{name}: {row_str}, {col_str}")

            self.place_object((start_col, start_row, end_col, end_row), name, image_path, self.intermediate_image)

            self.run_critic(name, image_path)

    def write_to_json(self):
        f = open('results/design.json', 'w')
        json.dump(self.design, f)
        f.close()

    def run(self):
        self.understand_image_and_task()
        self.add_objects()


if __name__ == '__main__':

    ################### TODO: Generalize it ######
    num_cols = 13
    num_rows = 12
    constraints = [
        {
            "object": "Window",
            "start": (2, 4),
            "end": (2, 8)
        },
        {
            "object": "Door",
            "start": (10, 3),
            "end": (10, 5)
        },
    ]
    #################################################

    initial_image = 'images/case2.png'
    requirement = "a minimalist bedroom"

    # Add verbose=True for model responses
    designer = Designer(room_dimensions=(num_rows, num_cols),
                        scene_image=initial_image,
                        constraints=constraints,
                        requirement=requirement,
                        verbose=True)
    designer.run()
    designer.write_to_json()
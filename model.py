from openai import OpenAI

from utils import encode_image


class Model:
    def __init__(self, key):
        self.client = OpenAI(api_key=key)
        self.messages = [{"role": "system",
                          "content": "You are a professional and experienced interior designer with a strong math "
                                     "background. You design aesthetically pleasing rooms and place furniture in the "
                                     "best way possible. You strictly keep the following design principles in mind "
                                     "while suggesting furniture positions:\n1. If there is a desk in the room, "
                                     "there must be a chair.\n2. The desk and the chair must be placed together and "
                                     "ideally in front of a window.\n3. Nightstands always go adjacent to beds\n4. "
                                     "There must be enough space left around the door to allow passing through the "
                                     "door."}]

    def add_message(self, role, prompt, image_path):
        content = [{"type": "text", "text": prompt}]
        if image_path is not None:
            base64_image = encode_image(image_path)
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{base64_image}"
                }
            }
            )
        self.messages.append({"role": role, "content": content})

    def query(self, prompt, image_path):
        self.add_message("user", prompt, image_path)
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=self.messages,
            seed=42,
            max_tokens=500,
            temperature=0,
        )
        response_content = response.choices[0].message.content
        self.add_message("assistant", response_content, None)
        return response_content

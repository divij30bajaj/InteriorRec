import asyncio
import random
import time

from openai import OpenAI, RateLimitError

from utils import encode_image


class Model:
    def __init__(self, key, in_context_examples):
        self.in_context_examples = in_context_examples
        content = [
                      {"type": "text",
                       "text": "You are a professional and experienced interior designer with a strong math "
                               "background. You design aesthetically pleasing rooms and place furniture in "
                               "the best way possible. You strictly keep the following design principles in "
                               "mind while suggesting furniture positions:\n1. If there is a desk in the "
                               "room, there must be a chair.\n2. The desk and the chair must be placed "
                               "together and ideally in front of a window.\n3. Nightstands always go adjacent "
                               "to beds\n4. There must be enough space left around the door to allow passing "
                               "through the door.\nAttached are a few examples of how the room might look like."},
                  ]
        self.client = OpenAI(api_key=key)
        self.messages = [{"role": "system",
                          "content": content}]

    def add_message(self, role, prompt, image_path, in_context=False):
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
        if in_context:
            content.extend([{
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{example}"
                }
            } for example in self.in_context_examples]
            )
        self.messages.append({"role": role, "content": content})

    async def _execute_query_with_retry(self, prompt, image_path):
        max_retries = 5
        base_delay = 1  # Start with 1 second delay

        for attempt in range(max_retries):
            try:
                return await asyncio.to_thread(
                    self.client.chat.completions.create,
                    model="gpt-4o",
                    messages=self.messages,
                    seed=42,
                    max_tokens=500,
                    temperature=0,
                )
            except RateLimitError as e:
                if attempt == max_retries - 1:
                    # If this was the last attempt, re-raise the exception
                    raise

                # Extract wait time from error message if available
                wait_time = None
                error_msg = str(e)
                if "Please try again in" in error_msg and "s." in error_msg:
                    try:
                        wait_time_str = error_msg.split("Please try again in")[1].split("s.")[0].strip()
                        wait_time = float(wait_time_str)
                    except (IndexError, ValueError):
                        pass

                # Calculate backoff with jitter
                if wait_time is None:
                    # If no explicit wait time, use exponential backoff
                    delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                else:
                    # If the API suggests a wait time, use that plus a small buffer
                    delay = wait_time + 0.5

                print(f"Rate limit hit. Retrying in {delay:.2f} seconds (attempt {attempt + 1}/{max_retries})...")
                await asyncio.sleep(delay)
            except Exception as e:
                # For other exceptions, don't retry
                print(f"Error during API call: {e}")
                raise

    async def query(self, prompt, image_path, in_context=False):
        self.add_message("user", prompt, image_path, in_context)

        response = await self._execute_query_with_retry(prompt, image_path)

        response_content = response.choices[0].message.content
        self.add_message("assistant", response_content, None)
        return response_content

# InteriorRec

### Add openAI key:
- create a .env file
- add `OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>`

### Steps to run frontend
- `cd frontend`
- if first time running, then do a `npm i`
- `npm run dev`
   
### Steps to run backend
- if first time running, then do a `pip install -r requirements.txt`
- `python -m uvicorn app:app --port 5000 --reload`

### TODO:
- Convert input room image to grid, and extract grid size and door/window cell positions --DONE
- Try multiple agents
- Account for the recommended orientation of the object

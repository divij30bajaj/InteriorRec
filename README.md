# InteriorRec

### Add openAI key:
- create a .env file
- add `OPENAI_API_KEY=<YOUR_OPENAI_API_KEY>`

### Steps to run frontend
- `cd frontend`
- if first time running, then do a `npm i`
- `npm run dev`
   
### Steps to run backend
- if first time running, then do a `pip install -r requirements.txt`. **NOTE** Used Python 3.12.9
- `python -m uvicorn app:app --port 5000 --reload`

### Additional files:
- *embedded_data.json*: used by retriever.py, also can be used by boolean retriever

### TODO:
- Convert input room image to grid, and extract grid size and door/window cell positions --DONE
- Try multiple agents -- DONE
- Account for the recommended orientation of the object
- Add objects to S3
- Generate color of each object
- Add colour to 3D models
- Search (Boolean)
- Integrate all components
- Complete UI (drag, select and chat window)
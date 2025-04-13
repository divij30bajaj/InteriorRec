import json

import torch
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')

with open("embedded_data.json", "r") as f:
    data = json.load(f)
    data_map = {item["item_id"]: item for item in data}

stored_embeddings = torch.tensor([item["embedding"] for item in data])

async def simple_retriever(query: str = "a yellow sofa", top_k: int = 1):
    print("simple_retriever: ", query)
    query_embedding = model.encode(query, convert_to_tensor=True)
    
    hits = util.semantic_search(query_embedding, stored_embeddings, top_k=top_k)
    hits = hits[0]
    
    results = []
    for hit in hits:
        idx = hit['corpus_id']  # index of the stored item
        score = hit['score']
        results.append((data[idx], score))
    return results

async def get_similar_items(item_id: str):
    item_description = data_map[item_id]["description"]
    items = await simple_retriever(item_description, 10)
    return [{"item_id": item[0]["item_id"], "description": item[0]["description"]} for item in items]

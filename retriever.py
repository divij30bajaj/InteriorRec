import json

import torch
from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer('all-MiniLM-L6-v2')
LIKED_BOOST = 0.25
DISLIKED_BOOST = -0.25

with open("embedded_data.json", "r") as f:
    data = json.load(f)
    data_map = {item["item_id"]: item for item in data}

with open("mapping_3d_spins.json", "r") as f:
    image_mapping = json.load(f)

stored_embeddings = torch.tensor([item["embedding"] for item in data])

async def simple_retriever(query: str = "a yellow sofa", top_k: int = 1):
    print("simple_retriever: ", query)
    query_embedding = model.encode(query, convert_to_tensor=True)
    
    hits = util.semantic_search(query_embedding, stored_embeddings, top_k=top_k+1)
    hits = hits[0]
    
    results = []
    for hit in hits:
        idx = hit['corpus_id']  # index of the stored item
        score = hit['score']
        if score < 0.99:
            results.append((data[idx], score))
    return results

async def rerank_items(retrieved_items, liked_items: list[str], disliked_items: list[str]):
    retrieved_items_embeddings = [data_map[item[0]["item_id"]]["embedding"] for item in retrieved_items]
    if len(liked_items) > 0:
        liked_embeddings = torch.mean(torch.stack([torch.tensor(data_map[item]["embedding"]) for item in liked_items]), dim=0) 
        liked_scores = [score[0] for score in util.cos_sim(retrieved_items_embeddings, liked_embeddings).tolist()]
    else:
        liked_scores = [0] * len(retrieved_items)
    if len(disliked_items) > 0:
        disliked_embeddings = torch.mean(torch.stack([torch.tensor(data_map[item]["embedding"]) for item in disliked_items]), dim=0) 
        disliked_scores = [score[0] for score in util.cos_sim(retrieved_items_embeddings, disliked_embeddings).tolist()]
    else:
        disliked_scores = [0] * len(retrieved_items)
    # print(liked_scores, disliked_scores)
    results = [(retrieved_items[i][0], retrieved_items[i][1] 
                + LIKED_BOOST * liked_scores[i] 
                + DISLIKED_BOOST * disliked_scores[i]) 
                for i in range(len(retrieved_items))]
    results.sort(key=lambda x: x[1], reverse=True)
    return results
    

async def get_similar_items(item_id: str, liked_items: list[str] = [], disliked_items: list[str] = []):
    item_description = data_map[item_id]["description"]
    items = await simple_retriever(item_description, 10)
    print([(item[1], item[0]["item_id"]) for item in items])
    reranked_items = await rerank_items(items, liked_items, disliked_items)
    print([(item[1], item[0]["item_id"]) for item in reranked_items])

    return [{
                "item_id": item[0]["item_id"],
                "description": item[0]["description"],
                "image_id": image_mapping[item[0]["item_id"]] 
                if item[0]["item_id"] in image_mapping else None
            } for item in reranked_items
        ]

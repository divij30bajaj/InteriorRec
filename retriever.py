import itertools
import json
import random

import torch
from sentence_transformers import SentenceTransformer, util
from transformers import AutoModel, AutoProcessor, AutoTokenizer, SiglipTextModel

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
text_tokenizer = AutoTokenizer.from_pretrained("google/siglip-base-patch16-224")
text_model = SiglipTextModel.from_pretrained("google/siglip-base-patch16-224").to(device)
LIKED_BOOST = 0.25
DISLIKED_BOOST = -0.25

with open("image_embedding_data.json", "r") as f:
    data = json.load(f)
    data_map = {item["item_id"]: item for item in data}

with open("mapping_3d_spins.json", "r") as f:
    image_mapping = json.load(f)

stored_embeddings = torch.tensor([item["embedding"] for item in data])

async def simple_retriever(query_embedding, item_embeddings, top_k: int = 1):
    
    hits = util.semantic_search(query_embedding, item_embeddings, top_k=top_k+1)
    hits = hits[0]
    
    results = []
    for hit in hits:
        idx = hit['corpus_id']  # index of the stored item
        score = hit['score']
        if score < 0.99:
            results.append((data[idx], score))
    return results

async def retrieve(query: str = "a yellow sofa", top_k: int = 1):
    print("simple_retriever: ", query)
    inputs = text_tokenizer([query], padding="max_length", truncation=True, return_tensors="pt").to(device)
    query_embedding = text_model(**inputs)
    query_embedding = query_embedding.pooler_output.cpu().detach().numpy().astype("float32")[0]
    # query_embedding = text_model.encode(query, convert_to_tensor=True)
    
    return await simple_retriever(query_embedding, stored_embeddings, top_k)

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
    items = await retrieve(item_description, 10)
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

async def get_similar_items_with_scene(item_id: str, liked_items: list[str] = [], disliked_items: list[str] = [], scene_items: list[str] = [], index: dict[str, set[str]] = {}):
    print("get_similar_items_with_scene", item_id)
    if "item_keywords" in data_map[item_id]:
        item_keywords = data_map[item_id]["item_keywords"].split(" ")
    else:
        return []
    index_items = []
    for keyword in item_keywords:
        if keyword in index:
            index_items.extend(index[keyword])
    if len(index_items) == 0:
        return []
    # print(item_keywords, index_items)
    index_items_embeddings = torch.tensor([data_map[item]["embedding"] for item in index_items])

    query_embedding = torch.mean(torch.stack([torch.tensor(data_map[item]["embedding"]) for item in scene_items]), dim=0)
    # results = await simple_retriever(query_embedding, index_items_embeddings, 10)
    hits = util.semantic_search(query_embedding, index_items_embeddings, top_k=10)
    hits = hits[0]
    
    results = []
    for hit in hits:
        idx = hit['corpus_id']  # index of the stored item
        score = hit['score']
        if score < 0.99:
            results.append((data_map[index_items[idx]], score))
    reranked_items = await rerank_items(results, liked_items, disliked_items)
    return [{
                "item_id": item[0]["item_id"],
                "description": item[0]["description"],
                "image_id": image_mapping[item[0]["item_id"]] 
                if item[0]["item_id"] in image_mapping else None
            } for item in reranked_items
    ]

async def goes_with_it(item_id: str, liked_items: list[str] = [], disliked_items: list[str] = [], scene_items: list[str] = [], index: dict[str, set[str]] = {}):
    if item_id in scene_items:
        scene_items.remove(item_id)
    retrieved_items = []
    for scene_item in scene_items:
        print("scene_item", scene_item)
        items = await simple_retriever(torch.tensor(data_map[scene_item]["embedding"]), stored_embeddings, 3)
        retrieved_items.append([item[0]["item_id"] for item in items])
    
    scenes = list(itertools.product(*retrieved_items))
    print(scenes)
    scene_embeddings = torch.stack([torch.mean(torch.stack([torch.tensor(data_map[item]["embedding"]) for item in scene]), dim=0) for scene in scenes])
    item_embedding = torch.tensor(data_map[item_id]["embedding"])
    item_data = {
                "item_id": data_map[item_id]["item_id"],
                "description": data_map[item_id]["description"],
                "image_id": image_mapping[data_map[item_id]["item_id"]] 
                if data_map[item_id]["item_id"] in image_mapping else None
            }
    print(item_data)
    hits = util.semantic_search(item_embedding, scene_embeddings, top_k=10)
    hits = hits[0]
    
    sample_scores = []
    for hit in hits:
        idx = hit['corpus_id']  # index of the stored item
        score = hit['score']
        sample_scores.append((idx, score))
    random_sample = random.sample(sample_scores, 5)
    random_sample = sorted(random_sample, key=lambda x: x[1], reverse=True)
    results = []
    for idx, _ in random_sample:
        results.append([{
                "item_id": data_map[item]["item_id"],
                "description": data_map[item]["description"],
                "image_id": image_mapping[data_map[item]["item_id"]] 
                if data_map[item]["item_id"] in image_mapping else None
            } for item in list(scenes[idx])])
        results[-1].append(item_data)
    return results

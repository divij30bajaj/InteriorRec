import os
import json
import numpy as np
from PIL import Image
import torch
import faiss
from transformers import AutoProcessor, AutoModel, AutoTokenizer, SiglipTextModel
from typing import Dict, List, Set, Tuple, Optional
from simple_retrieval import SimpleRetrieval

class ImageRetrieval(SimpleRetrieval):
    def __init__(self, 
                mapping_file: str = 'mapping_3d_spins.json',
                images_folder: str = 'images',
                embeddings_file: str = 'img_embeddings.npy',
                ids_file: str = 'item_ids_re_img.npy',
                faiss_index_file: str = 'image_index.faiss',
                index_file: str = 'inverse_index.json'):
        
        # Initialize parent class (SimpleRetrieval) for boolean search only
        super().__init__(index_file=index_file)
        
        print(f"Initializing ImageRetrieval with:")
        print(f"- FAISS index: {faiss_index_file}")
        print(f"- Item IDs: {ids_file}")
        print(f"- Embeddings: {embeddings_file}")
        
        self.mapping_file = mapping_file
        self.images_folder = images_folder
        self.embeddings_file = embeddings_file
        self.ids_file = ids_file
        self.faiss_index_file = faiss_index_file
        self.faiss_index = None
        self.item_ids = None
        self.embeddings = None
        
        # Initialize SIGLIP models for image processing
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.image_processor = AutoProcessor.from_pretrained("google/siglip-base-patch16-224")
        self.image_model = AutoModel.from_pretrained("google/siglip-base-patch16-224").to(self.device)
        self.text_tokenizer = AutoTokenizer.from_pretrained("google/siglip-base-patch16-224")
        self.text_model = SiglipTextModel.from_pretrained("google/siglip-base-patch16-224").to(self.device)
        
        self.image_model.eval()
        self.text_model.eval()
        
        # Load mappings
        try:
            with open(mapping_file, 'r') as f:
                self.mapping = json.load(f)
                print(f"Loaded mapping file with {len(self.mapping)} items")
        except Exception as e:
            print(f"Error loading mapping file: {e}")
            self.mapping = {}
            
    def get_text_embedding(self, text: str) -> np.ndarray:
        """Override: Get embedding for text using SIGLIP text model"""
        with torch.no_grad():
            inputs = self.text_tokenizer([text], padding="max_length", return_tensors="pt").to(self.device)
            outputs = self.text_model(**inputs)
            embedding = outputs.pooler_output.cpu().numpy().astype("float32")
            return embedding[0]
            
    def get_image_embedding(self, image_path: str) -> Optional[np.ndarray]:
        """Get embedding for image using SIGLIP image model"""
        try:
            if not os.path.exists(image_path):
                print(f"⚠️ Missing file: {image_path}")
                return None
                
            image = Image.open(image_path).convert("RGB")
            inputs = self.image_processor(images=image, return_tensors="pt").to(self.device)
            
            with torch.no_grad():
                feats = self.image_model.get_image_features(**inputs)
            return feats.cpu().numpy().astype("float32")[0]
            
        except Exception as e:
            print(f"Error processing image {image_path}: {e}")
            return None
            
    def build_and_save_index(self):
        """Build FAISS index for image embeddings"""
        print("Building image index...")
        
        embeddings = []
        ids = []
        
        for item_id, img_id in self.mapping.items():
            img_path = os.path.join(self.images_folder, f"{img_id}_01.jpg")
            embedding = self.get_image_embedding(img_path)
            
            if embedding is not None:
                embeddings.append(embedding)
                ids.append(item_id)
                
        if embeddings:
            print(f"Building FAISS index with {len(embeddings)} embeddings")
            emb_array = np.stack(embeddings, axis=0)
            self.build_faiss_index(emb_array, ids)
            
        # Save indices
        self.save_indices()
        
    def build_faiss_index(self, embeddings: np.ndarray, item_ids: List[str]):
        """Build FAISS index from embeddings"""
        dimension = embeddings.shape[1]
        self.faiss_index = faiss.IndexFlatL2(dimension)
        self.faiss_index.add(embeddings)
        self.item_ids = item_ids
        self.embeddings = embeddings
        
    def save_indices(self):
        """Save FAISS index and related data to disk"""
        print("Saving indices...")
            
        # Save FAISS data
        if self.embeddings is not None and len(self.embeddings) > 0:
            np.save(self.embeddings_file, self.embeddings)
            print(f"Saved embeddings to {self.embeddings_file}")
            
        if self.item_ids and len(self.item_ids) > 0:
            np.save(self.ids_file, np.array(self.item_ids))
            print(f"Saved {len(self.item_ids)} item IDs to {self.ids_file}")
            
        if self.faiss_index is not None:
            faiss.write_index(self.faiss_index, self.faiss_index_file)
            print(f"Saved FAISS index to {self.faiss_index_file}")
        
    def load_indices(self):
        """Load FAISS index and related data from disk"""
        print("Loading indices...")
            
        try:
            # Load embeddings
            if os.path.exists(self.embeddings_file):
                self.embeddings = np.load(self.embeddings_file)
                print(f"Loaded embeddings with shape {self.embeddings.shape}")
            else:
                raise FileNotFoundError(f"Embeddings file {self.embeddings_file} not found")
            
            # Load item IDs
            if os.path.exists(self.ids_file):
                self.item_ids = np.load(self.ids_file, allow_pickle=True)
                print(f"Loaded {len(self.item_ids)} item IDs")
            else:
                raise FileNotFoundError(f"Item IDs file {self.ids_file} not found")
            
            # Load FAISS index
            if os.path.exists(self.faiss_index_file):
                self.faiss_index = faiss.read_index(self.faiss_index_file)
                print(f"Loaded FAISS index with {self.faiss_index.ntotal} vectors")
                
                # Verify dimensions match
                if self.faiss_index.ntotal != len(self.item_ids):
                    raise ValueError(f"Mismatch between FAISS index size ({self.faiss_index.ntotal}) and item IDs ({len(self.item_ids)})")
            else:
                raise FileNotFoundError(f"FAISS index file {self.faiss_index_file} not found")
                
        except Exception as e:
            print(f"Error loading indices: {e}")
            raise
            
    def retrieve_similar_siglip(self, query_embedding: np.ndarray, k: int = 10) -> List[Tuple[str, float]]:
        """
        Retrieve k most similar items using SIGLIP-based FAISS index
        Returns list of (item_id, distance) tuples
        """
        if self.faiss_index is None:
            raise ValueError("SIGLIP FAISS index not initialized")

        distances, indices = self.faiss_index.search(query_embedding.reshape(1, -1), k)
        return [(str(self.item_ids[idx]), float(dist)) for idx, dist in zip(indices[0], distances[0])]

    async def retrieve_with_query_object(self, user_input: Dict[str, str], k: int = 10) -> List[Dict[str, str]]:
        """Process query object and retrieve results using SIGLIP embeddings"""
        try:
            # Use parent class's process_query to get boolean query and description
            boolean_query, object_description = await self.process_query(user_input)
            
            # First get items matching boolean query
            boolean_matches = self.boolean_query(boolean_query)
            if not boolean_matches:
                return []

            # Get SIGLIP embedding for the description
            query_embedding = self.get_text_embedding(object_description)
            
            # Find indices of items that match boolean query
            matching_indices = []
            for i, item_id in enumerate(self.item_ids):
                if str(item_id) in boolean_matches:
                    matching_indices.append(i)
            
            if not matching_indices:
                return []

            # Create a temporary FAISS index with only the matching items
            dimension = self.embeddings.shape[1]
            temp_index = faiss.IndexFlatL2(dimension)
            temp_embeddings = self.embeddings[matching_indices]
            temp_index.add(temp_embeddings)
            
            # Search in filtered index using SIGLIP embedding
            distances, local_indices = temp_index.search(
                query_embedding.reshape(1, -1), 
                min(k, len(matching_indices))
            )
            
            # Map back to original item IDs and create results
            final_results = []
            for idx, dist in zip(local_indices[0], distances[0]):
                item_id = str(self.item_ids[matching_indices[idx]])
                item_description = self.data_map[item_id]["description"]
                image_id = self.mapping[item_id] if item_id in self.mapping else None
                final_results.append({
                    "item_id": item_id,
                    "description": item_description,
                    "image_id": image_id,
                    "score": float(dist)
                })
            
            return final_results
            
        except Exception as e:
            print(f"Error in retrieval: {e}")
            raise

    def get_item_image_embedding(self, item_id: str) -> Optional[np.ndarray]:
        """Get the SIGLIP image embedding for a given item_id"""
        try:
            # Find the index of the item_id in our item_ids array
            item_idx = np.where(self.item_ids == item_id)[0]
            if len(item_idx) == 0:
                print(f"Item ID {item_id} not found in image embeddings")
                return None
                
            # Get the embedding at that index
            embedding = self.embeddings[item_idx[0]]
            return embedding
            
        except Exception as e:
            print(f"Error getting image embedding: {e}")
            return None

    def append_image_embeddings_to_json(self, json_file: str = 'embedded_data.json'):
        """Append image embeddings to the embedded_data.json file"""
        try:
            # Load the existing JSON data
            with open(json_file, 'r') as f:
                data = json.load(f)
            
            # Add image embeddings to each item
            for item in data:
                item_id = item['item_id']
                image_embedding = self.get_item_image_embedding(item_id)
                if image_embedding is not None:
                    item['image_embedding'] = image_embedding.tolist()
            
            # Save the updated data
            with open(json_file, 'w') as f:
                json.dump(data, f)
                
            print(f"Successfully added image embeddings to {json_file}")
            
        except Exception as e:
            print(f"Error appending image embeddings: {e}")
            raise

def main():
    # Example usage
    retrieval = ImageRetrieval()
    retrieval.build_and_save_index()
    
    # Test boolean and similarity search
    text_query = "Modern wooden dining table with sleek design"
    results = retrieval.retrieve_with_boolean_and_similarity(
        boolean_query="modern AND wood AND table AND dining",
        query_embedding=retrieval.get_text_embedding(text_query),
        k=5
    )
    print("Search results:", results)

if __name__ == "__main__":
    main()

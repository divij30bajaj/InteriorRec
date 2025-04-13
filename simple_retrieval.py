import json
import numpy as np
import faiss
from typing import Dict, List, Set, Tuple
import re
import os
import argparse

class SimpleRetrieval:
    def __init__(self, index_file: str = 'inverse_index.json', embeddings_file: str = 'embeddings.npy'):
        self.index_file = index_file
        self.embeddings_file = embeddings_file
        self.index: Dict[str, Set[str]] = {}
        self.items: Dict[str, Dict] = {}
        self.faiss_index = None
        self.item_ids = []
        self.embeddings = None
        
    def build_and_save_index(self, data_file: str):
        """Build inverse index from the embedded data JSON file and save it"""
        print("Building inverse index...")
        with open(data_file, 'r') as f:
            data = json.load(f)
            
        # Track all available keys
        all_keys = set()
        embeddings_data = []
        item_ids_list = []
        
        # Check if data is a list or dictionary
        if isinstance(data, list):
            print(f"Data is a list with {len(data)} items")
            for item in data:
                if 'item_id' not in item:
                    print(f"Warning: Item missing 'item_id' key: {item}")
                    continue
                    
                item_id = item['item_id']
                self.items[item_id] = item
                all_keys.update(item.keys())
                
                # Process each relevant field
                fields = [
                    'color', 'description', 'item_keywords', 'item_shape', 
                    'material', 'style', 'fabric_type', 'finish_type', 
                    'pattern', 'dimensions'
                ]
                
                for field in fields:
                    if field in item:
                        # Handle both string and list values
                        values = item[field]
                        if isinstance(values, str):
                            values = [values]
                        
                        # Process each value
                        for value in values:
                            if value:
                                # Convert to lowercase and split into words
                                words = re.findall(r'\w+', value.lower())
                                for word in words:
                                    if word not in self.index:
                                        self.index[word] = set()
                                    self.index[word].add(item_id)
                
                # Check for embedding data
                if 'embedding' in item:
                    embeddings_data.append(item['embedding'])
                    item_ids_list.append(item_id)
        else:
            # Handle as dictionary (original code)
            for item_id, item_data in data.items():
                self.items[item_id] = item_data
                all_keys.update(item_data.keys())
                
                # Process each relevant field
                fields = [
                    'color', 'description', 'item_keywords', 'item_shape', 
                    'material', 'style', 'fabric_type', 'finish_type', 
                    'pattern', 'dimensions'
                ]
                
                for field in fields:
                    if field in item_data:
                        # Handle both string and list values
                        values = item_data[field]
                        if isinstance(values, str):
                            values = [values]
                        
                        # Process each value
                        for value in values:
                            if value:
                                # Convert to lowercase and split into words
                                words = re.findall(r'\w+', value.lower())
                                for word in words:
                                    if word not in self.index:
                                        self.index[word] = set()
                                    self.index[word].add(item_id)
                
                # Check for embedding data
                if 'embedding' in item_data:
                    embeddings_data.append(item_data['embedding'])
                    item_ids_list.append(item_id)
        
        # Save the inverse index
        with open(self.index_file, 'w') as f:
            json.dump({
                'index': {k: list(v) for k, v in self.index.items()},
                'items': self.items
            }, f)
        print(f"Inverse index saved to {self.index_file}")
        
        # Print available keys
        print(f"Available keys in the data: {all_keys}")
        
        # Build FAISS index if embeddings are available
        if embeddings_data:
            print(f"Found {len(embeddings_data)} items with embeddings")
            embeddings_array = np.array(embeddings_data)
            self.build_faiss_index(embeddings_array, item_ids_list)
        else:
            print("No embeddings found in the data")
    
    def load_index(self):
        """Load the pre-built inverse index"""
        if not os.path.exists(self.index_file):
            raise FileNotFoundError(f"Inverse index file {self.index_file} not found")
            
        with open(self.index_file, 'r') as f:
            data = json.load(f)
            self.index = {k: set(v) for k, v in data['index'].items()}
            self.items = data['items']
    
    def _evaluate_expression(self, terms: List[str]) -> Set[str]:
        """Evaluate a boolean expression without parentheses"""
        if not terms:
            return set()
            
        # Initialize result with first term's items
        result = self.index.get(terms[0].lower(), set())
        
        i = 1
        while i < len(terms):
            operator = terms[i].upper()
            if i + 1 >= len(terms):
                break
                
            next_term = terms[i + 1].lower()
            next_items = self.index.get(next_term, set())
            
            if operator == 'AND':
                result = result.intersection(next_items)
            elif operator == 'OR':
                result = result.union(next_items)
                
            i += 2
            
        return result
    
    def _process_parentheses(self, query: str) -> str:
        """Process parentheses in the query and evaluate sub-expressions"""
        # Find the innermost parentheses
        while '(' in query:
            # Find the innermost parentheses
            start = query.rfind('(')
            end = query.find(')', start)
            
            if start == -1 or end == -1:
                break
                
            # Extract the sub-expression
            sub_expr = query[start + 1:end]
            
            # Evaluate the sub-expression
            sub_result = self._evaluate_expression(sub_expr.split())
            
            # Replace the sub-expression with a temporary token
            temp_token = f"__TEMP_{len(sub_result)}__"
            query = query[:start] + temp_token + query[end + 1:]
            
            # Store the result
            self.index[temp_token] = sub_result
            
        return query
    
    def boolean_query(self, query: str) -> Set[str]:
        """
        Process a boolean query with parentheses and return matching item_ids
        Query format: (word1 AND word2) OR (word3 AND word4)
        """
        # Convert query to lowercase and remove extra spaces
        query = ' '.join(query.lower().split())
        
        # Process parentheses
        query = self._process_parentheses(query)
        
        # Split query into terms
        terms = query.split()
        
        # Evaluate the final expression
        result = self._evaluate_expression(terms)
        
        # Clean up temporary tokens
        for key in list(self.index.keys()):
            if key.startswith('__TEMP_'):
                del self.index[key]
                
        return result
    
    def build_faiss_index(self, embeddings: np.ndarray, item_ids: List[str]):
        """Build FAISS index from embeddings"""
        dimension = embeddings.shape[1]
        self.faiss_index = faiss.IndexFlatL2(dimension)
        self.faiss_index.add(embeddings)
        self.item_ids = item_ids
        self.embeddings = embeddings
        
        # Save embeddings for later use
        np.save(self.embeddings_file, embeddings)
        print(f"FAISS index built with {len(item_ids)} items and {dimension} dimensions")
        
    def load_faiss_index(self):
        """Load pre-built FAISS index"""
        if not os.path.exists(self.embeddings_file):
            raise FileNotFoundError(f"Embeddings file {self.embeddings_file} not found")
            
        self.embeddings = np.load(self.embeddings_file)
        dimension = self.embeddings.shape[1]
        self.faiss_index = faiss.IndexFlatL2(dimension)
        self.faiss_index.add(self.embeddings)
        print(f"FAISS index loaded with {self.embeddings.shape[0]} items and {dimension} dimensions")
        
    def retrieve_similar(self, query_embedding: np.ndarray, k: int = 10) -> List[Tuple[str, float]]:
        """
        Retrieve k most similar items using FAISS
        Returns list of (item_id, distance) tuples
        """
        if self.faiss_index is None:
            raise ValueError("FAISS index not initialized")
            
        distances, indices = self.faiss_index.search(query_embedding.reshape(1, -1), k)
        return [(self.item_ids[idx], float(dist)) for idx, dist in zip(indices[0], distances[0])]
    
    def retrieve_with_boolean_and_similarity(self, 
                                          boolean_query: str, 
                                          query_embedding: np.ndarray, 
                                          k: int = 10) -> List[Tuple[str, float]]:
        """
        First apply boolean query to filter items, then rank by similarity
        Returns list of (item_id, distance) tuples
        """
        # Get items matching boolean query
        boolean_matches = self.boolean_query(boolean_query)
        
        if not boolean_matches:
            return []
            
        # Create a temporary FAISS index with only matching items
        matching_indices = [i for i, item_id in enumerate(self.item_ids) if item_id in boolean_matches]
        if not matching_indices:
            return []
            
        temp_index = faiss.IndexFlatL2(query_embedding.shape[0])
        temp_embeddings = self.embeddings[matching_indices]
        temp_index.add(temp_embeddings)
        
        # Search in the filtered index
        distances, local_indices = temp_index.search(query_embedding.reshape(1, -1), min(k, len(matching_indices)))
        
        # Map back to original item IDs
        return [(self.item_ids[matching_indices[idx]], float(dist)) 
                for idx, dist in zip(local_indices[0], distances[0])]

def build_index(data_file: str, index_file: str = 'inverse_index.json'):
    """One-time function to build and save the inverse index"""
    retrieval = SimpleRetrieval(index_file=index_file)
    retrieval.build_and_save_index(data_file)
    return retrieval

def main():
    parser = argparse.ArgumentParser(description='Build inverse index from embedded data')
    parser.add_argument('--data_file', type=str, default='embedded_data.json', 
                        help='Path to the embedded data JSON file')
    parser.add_argument('--index_file', type=str, default='inverse_index.json', 
                        help='Path to save the inverse index JSON file')
    parser.add_argument('--embeddings_file', type=str, default='embeddings.npy', 
                        help='Path to save the embeddings numpy file')
    
    args = parser.parse_args()
    
    # Build and save the index
    retrieval = SimpleRetrieval(index_file=args.index_file, embeddings_file=args.embeddings_file)
    retrieval.build_and_save_index(args.data_file)
    
    print("Index building completed successfully!")

if __name__ == "__main__":
    main() 
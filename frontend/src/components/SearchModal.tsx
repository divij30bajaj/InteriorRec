import React, { useState, useRef, useEffect } from 'react';
import "../App.css"
import { API_URL } from '../services/designService';

// Type for individual search result (adjust properties as needed)
type SearchResult = {
  itemId: string;
  imageId: string;
  description: string;
};

// Props for the Modal component
interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItemId: string;
  likedFurniture: string[];
  dislikedFurniture: string[];
  currentScene: string[];
  replaceFurniture: (item: string) => void;
}

interface QueryObject {
  selectedItemId: string
  user_query: string
}

const ModelThumbnail = ({ imageId }: { imageId: string }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imageId) {
      setError(true);
      setLoading(false);
      return;
    }
    const handleLoad = () => {
      setLoading(false);
    };
    const handleError = () => {
      console.error(`Error loading image thumbnail: ${imageId}`);
      setError(true);
      setLoading(false);
    };
    if (imgRef.current) {
      imgRef.current.onload = handleLoad;
      imgRef.current.onerror = handleError;
    }

  }, [imageId]);

  if (error) {
    return (
      <div className="thumbnail-placeholder">
        <span>No Preview</span>
      </div>
    );
  }


  // Get first two characters of the imageId for the folder structure
  const prefix = imageId ? imageId.substring(0, 2) : '';
  const imageUrl = `https://amazon-berkeley-objects.s3.amazonaws.com/spins/original/${prefix}/${imageId}/${imageId}_01.jpg`;

  return (
    <>
      {loading && <div className="thumbnail-loading">Loading...</div>}
      <img
        ref={imgRef}
        className="model-thumbnail"
        src={imageUrl}
        alt={`Thumbnail for ${imageId}`}
        style={{ width: '80px', height: '80px', objectFit: 'cover' }}
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </>
  );
};

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, selectedItemId, likedFurniture, dislikedFurniture, currentScene, replaceFurniture }) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [similarItems, setSimilarItems] = useState<SearchResult[]>([]);
  const [goesWithItems, setGoesWithItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    const queryObject: QueryObject = {
      selectedItemId: selectedItemId,
      user_query: query
    }
    try {
      const requestBody = {
        query_object: queryObject,
        k: 10,
      };

      const response = await fetch(`${API_URL}/retrieve-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      const data = await response.json();
      console.log(data);
      setResults(data);
    } catch (err) {
      setError("An error occurred while searching.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const runRetrievers = async () => {
    try {
      await Promise.all([
        handleSearch(),
        getSimilarItems(),
        handleGoesWith(),
      ]);
    } catch (err) {
      console.log("One of the retrievers failed: " + err);
    }
  }

  const getSimilarItems = async () => {
    const similarItemsResult = await fetch(`${API_URL}/get-similar-items?item_id=${selectedItemId}`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ liked_items: likedFurniture, disliked_items: dislikedFurniture }),
        method: 'POST'
      }
    );
    const data = await similarItemsResult.json();
    console.log(data);
    setSimilarItems(data);
  };

  const handleGoesWith = async () => {
    const goesWithItemsResult = await fetch(`${API_URL}/get-similar-items-with-scene?item_id=${selectedItemId}`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ liked_items: likedFurniture, disliked_items: dislikedFurniture, scene_items: currentScene }),
        method: 'POST'
      }
    );
    const data = await goesWithItemsResult.json();
    console.log(data);
    setGoesWithItems(data);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className={"close-button"}>
          Close
        </button>
        <p>
          Enter a search query below to help find the object you like.
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter search query..."
        />
        <button onClick={runRetrievers}>Search</button>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div className="search-results">
          <h3>Results</h3>
          {results.length > 0 ? (
            <div className="similar-items-list">
            <ul>
              {results.map((item: any) => (
                <div
                  className="search-results"
                  key={item.item_id}
                  onClick={() => { replaceFurniture(item); onClose() }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="similar-item">
                    <div className="thumbnail-container">
                      <ModelThumbnail imageId={item.image_id} />
                    </div>
                    <div className="item-info">
                      <li>{item.item_id} - {item.description}</li>
                    </div>
                  </div>
                  </div>
                ))}
              </ul>
            </div>
          ) : (
            !loading && <p>No results found.</p>
          )}
        </div>
        <div className="similar-items-results">
          <div className="similar-items-results-div">
            {similarItems.length > 0 && (
              <>
                <h3>You might also like</h3>
                <div className="similar-items-list">
                  <ul>
                    {similarItems.map((item: any) => (
                      <div
                        className="furniture-details"
                        key={item.item_id}
                        onClick={() => { replaceFurniture(item); onClose() }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="similar-item">
                          <div className="thumbnail-container">
                            <ModelThumbnail imageId={item.image_id} />
                          </div>
                          <div className="item-info">
                            <li>{item.item_id} - {item.description}</li>
                          </div>
                        </div>
                      </div>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
          <div className="similar-items-results-div">
            {goesWithItems.length > 0 && (
              <>
                <h3>Items that go with the room</h3>
                <div className="similar-items-list">
                  <ul>
                    {goesWithItems.map((item: any) => (
                      <div
                        className="furniture-details"
                        key={item.item_id}
                        onClick={() => { replaceFurniture(item); onClose() }}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="similar-item">
                          <div className="thumbnail-container">
                            <ModelThumbnail imageId={item.image_id} />
                          </div>
                          <div className="item-info">
                            <li>{item.item_id} - {item.description}</li>
                          </div>
                        </div>
                      </div>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
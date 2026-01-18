from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_ollama import OllamaEmbeddings, ChatOllama
import numpy as np 
from sklearn.cluster import DBSCAN

embeddings_model = OllamaEmbeddings(model="nomic-embed-text")
chat_model = ChatOllama(model="llama3.2")

class TabContent(BaseModel):
    tabId: int 
    url: str
    title: str
    text: str
    keywords: list[str] = []

class ClusterRequest(BaseModel):
    tabs: list[TabContent]

class ClusterResult(BaseModel):
    id: str
    name: str
    color: str
    tabIds: list[int]
    confidence: float

def generate_embeddings(tabs: list[TabContent]) -> list[list[float]]:
    """Convert tab content to numerical vectors."""
    texts = []
    for tab in tabs:
        # Combine title and content for richer embedding
        combined = f"Title: {tab.title}\nContent: {tab.text[:1000]}"
        texts.append(combined)
    
    # Generate embeddings via Ollama
    embeddings = embeddings_model.embed_documents(texts)
    return embeddings

def cluster_embeddings(embeddings: list[list[float]]):
    if len(embeddings) < 2: 
        return [0] * len(embeddings)
    
    X = np.array(embeddings)
    
    # Debug: Calculate pairwise cosine distances
    from sklearn.metrics.pairwise import cosine_distances
    distances = cosine_distances(X)
    print(f"[Debug] Cosine distance matrix:\n{np.round(distances, 3)}")
    
    clustering = DBSCAN(eps=0.4, min_samples=2, metric='cosine').fit(X)
    
    print(f"[Debug] DBSCAN labels: {clustering.labels_}")
    
    return clustering.labels_.tolist()

def generate_group_name(tabs: list[TabContent]) -> str:
    """
    Use LLM to create a short descriptive name for a group of tabs.
    """
    # Get titles from the tabs (limit to 5 for brevity)
    titles = [tab.title for tab in tabs[:5]]
    
    prompt = f"""Based on these browser tab titles, generate a short (2-4 words) 
descriptive group name that captures their common theme.

Tab titles:
{chr(10).join(f'- {t}' for t in titles)}

Respond with ONLY the group name, nothing else:"""
    
    try:
        response = chat_model.invoke(prompt)
        # Clean up the response
        name = response.content.strip().strip('"').strip("'")
        # Limit length
        return name[:30] if len(name) > 30 else name
    except Exception as e:
        print(f"Error generating name: {e}")
        # Fallback: use domain from first tab
        return tabs[0].url.split('/')[2] if tabs else "Unnamed Group"

def assign_color(cluster_id: int) -> str:
    """Assign a Chrome-compatible color to each cluster."""
    colors = ['blue', 'green', 'yellow', 'purple', 'pink', 'cyan', 'orange', 'red']
    return colors[cluster_id % len(colors)]

app = FastAPI(title="Chronicle API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (fine for development)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/cluster", response_model=list[ClusterResult])
async def cluster_tabs(request: ClusterRequest):
    print(f"Received {len(request.tabs)} tabs")
    
    if not request.tabs: 
        return []
    
    print(f"[Chronicle] Clustering {len(request.tabs)} tabs...")
    embeddings = generate_embeddings(request.tabs)
    labels = cluster_embeddings(embeddings)
    clusters: dict[int, list[TabContent]] = {}
    for tab, label in zip(request.tabs, labels):
        if label == -1:
            continue
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(tab)
        
    results: list[ClusterResult] = []
    for cluster_id, tabs in clusters.items():
        if len(tabs) < 2:
            continue
        name = generate_group_name(tabs)
        results.append(ClusterResult(
            id=f"cluster_{cluster_id}",
            name=name,
            color=assign_color(cluster_id),
            tabIds=[tab.tabId for tab in tabs],
            confidence=0.8,
            
        ))
    print(f"[Chronicle] Returning {len(results)} clusters")
    return results

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
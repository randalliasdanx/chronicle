// import { useState } from "react";
import Popup from "../src/popup/Popup";
import "./App.css";
import { useState } from "react";

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleClusterClick = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CLUSTER_TABS"
      })

      if (response.success) {
        setResult(`Grouped tabs into ${response.data.length} clusters!`)
      } else{
        setResult(`Error: ${response.error}`);
      }
    } catch (error) {
      setResult(`Error: ${(error as Error).message}`)
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Popup />
      <button onClick={handleClusterClick} disabled={loading} className="border-2 border-amber-200">{loading ? 'Clustering...' : "Group similar groups"} Groups</button>
      {
        result && (
          <p>{result}</p>
        )
      }
    </>
  );
}

export default App;

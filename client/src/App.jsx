import { useState } from 'react';
import axios from 'axios';
import './App.css'; // We will add some simple styles below

function App() {
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file || !jobDesc) {
      alert("Please select a file and paste the Job Description");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      // Make sure this is 5001!
const res = await axios.post('http://localhost:5001/analyze', formData);
      setResult(res.data);
    } catch (error) {
      console.error(error);
      alert("Analysis failed. Check console.");
    }
    setLoading(false);
  };

  return (
    <div className="container">
      <h1>🚀 JobAlign AI</h1>
      <p className="subtitle">Optimize your resume for the ATS</p>

      {/* INPUT SECTION */}
      <div className="input-group">
        <textarea 
          placeholder="Paste Job Description here..." 
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
          rows="4"
        />
        <input 
          type="file" 
          accept=".pdf"
          onChange={(e) => setFile(e.target.files[0])} 
        />
        <button onClick={handleUpload} disabled={loading} className="analyze-btn">
          {loading ? "Analyzing..." : "Analyze Match"}
        </button>
      </div>

      {/* RESULTS SECTION */}
      {result && (
        <div className="result-card">
          <div className="score-section">
            <div className="score-circle" style={{
              background: `conic-gradient(${getScoreColor(result.matchScore)} ${result.matchScore * 3.6}deg, #e0e0e0 0deg)`
            }}>
              <span className="score-text">{result.matchScore}%</span>
            </div>
            <h3>Match Score</h3>
          </div>

          <div className="details-section">
            <div className="summary-box">
              <h4>📝 AI Summary</h4>
              <p>{result.summary}</p>
            </div>

            <div className="keywords-box">
              <h4>⚠️ Missing Keywords</h4>
              <div className="tags">
                {result.missingKeywords.map((keyword, index) => (
                  <span key={index} className="tag missing">{keyword}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to change color based on score
function getScoreColor(score) {
  if (score >= 80) return "#4caf50"; // Green
  if (score >= 50) return "#ff9800"; // Orange
  return "#f44336"; // Red
}

export default App;
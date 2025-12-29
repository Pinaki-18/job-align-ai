import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError("");
  };

  const handleUpload = async () => {
    if (!file || !jobDesc) {
      setError("Please provide both a Job Description and a Resume PDF.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      // Connects to your backend on Port 5001
      const res = await axios.post('http://localhost:5001/analyze', formData);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError("Analysis failed. Please check if the server is running.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to determine circle color based on score
  const getScoreColor = (score) => {
    if (score >= 80) return "#10b981"; // Green
    if (score >= 50) return "#f59e0b"; // Yellow
    return "#ef4444"; // Red
  };

  return (
    <div className="container">
      <header>
        <h1>JobAlign AI</h1>
        <p className="subtitle">Resume & JD Matcher Powered by Gemini</p>
      </header>

      {/* INPUT SECTION */}
      <div className="upload-section">
        <h3>1. Paste Job Description</h3>
        <textarea 
          placeholder="Paste the full job description here..."
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
        />

        <h3>2. Upload Resume (PDF)</h3>
        <div className="file-drop">
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
            id="fileInput"
          />
          <label htmlFor="fileInput">
            {file ? (
              <span style={{ color: '#4ade80' }}>📄 {file.name}</span>
            ) : (
              <span>Click to Upload Resume PDF</span>
            )}
          </label>
        </div>

        {error && <p style={{ color: '#ef4444', marginTop: '1rem' }}>{error}</p>}

        <button 
          className="analyze-btn" 
          onClick={handleUpload} 
          disabled={loading}
        >
          {loading ? "Scanning Resume..." : "Analyze Match"}
        </button>
      </div>

      {/* RESULTS SECTION */}
      {result && (
        <div className="results-grid">
          
          {/* LEFT: SCORE CIRCLE */}
          <div className="score-card">
            <svg viewBox="0 0 36 36" className="circular-chart">
              <path className="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path className="circle"
                strokeDasharray={`${result.matchScore}, 100`}
                stroke={getScoreColor(result.matchScore)}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <text x="18" y="20.35" className="percentage">
                {result.matchScore}%
              </text>
            </svg>
            <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Match Score</p>
          </div>

          {/* RIGHT: DETAILS */}
          <div className="details-card">
            <div style={{ marginBottom: '1.5rem' }}>
              <h3>Missing Keywords</h3>
              <div className="badge-container">
                {result.missingKeywords.length > 0 ? (
                  result.missingKeywords.map((kw, i) => (
                    <span key={i} className="badge">
                      {kw}
                    </span>
                  ))
                ) : (
                  <span style={{ color: '#94a3b8' }}>None! Perfect match.</span>
                )}
              </div>
            </div>

            <div>
              <h3>AI Verdict</h3>
              <p className="summary-text">{result.summary}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
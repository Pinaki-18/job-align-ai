import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://job-align-ai.onrender.com';

function App() {
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [shareLink, setShareLink] = useState(null);
  const [viewMode, setViewMode] = useState("upload"); // "upload" or "shared"

  // Check if URL has /share/:id parameter on mount
  useEffect(() => {
    const path = window.location.pathname;
    const shareMatch = path.match(/\/share\/([a-f0-9-]+)/i);
    
    if (shareMatch) {
      const sharedId = shareMatch[1];
      loadSharedAnalysis(sharedId);
    }
  }, []);

  const loadSharedAnalysis = async (id) => {
    setLoading(true);
    setViewMode("shared");
    try {
      const res = await axios.get(`${API_URL}/api/analysis/${id}`);
      setResult(res.data.result);
    } catch (err) {
      setError("❌ Shared analysis not found or expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleUpload = async () => {
    if (!file || !jobDesc) {
      setError("⚠️ Please provide both a Job Description and a Resume PDF.");
      return;
    }

    setLoading(true);
    setResult(null);
    setJobs([]);
    setShareLink(null);
    setError("");

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      // 1. Send for Analysis
      const res = await axios.post(`${API_URL}/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      const parsedResult = {
        ...res.data,
        matchScore: Number(res.data.matchScore) || 0,
        missingKeywords: Array.isArray(res.data.missingKeywords) ? res.data.missingKeywords : []
      };

      setResult(parsedResult);

      // 2. Generate Share Link - FIXED to use /share/:id route
      try {
        const saveRes = await axios.post(`${API_URL}/save-analysis`, parsedResult);
        const frontendUrl = window.location.origin; // Gets your Netlify/Vercel URL
        setShareLink(`${frontendUrl}/share/${saveRes.data.id}`);
      } catch (saveErr) {
        console.warn("Share logic failed.");
      }

      if (parsedResult.searchQuery) await fetchJobs(parsedResult.searchQuery);

    } catch (err) {
      setError(`❌ ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async (query) => {
    try {
      const res = await axios.get(`${API_URL}/search-jobs?query=${encodeURIComponent(query)}`, { timeout: 10000 });
      if (Array.isArray(res.data) && res.data.length > 0) setJobs(res.data);
      else useMockJobs(query);
    } catch { useMockJobs(query); }
  };

  const useMockJobs = (query) => {
    const cleanTitle = (query || "Developer").replace(/Search query|Remote|Developer/gi, "").trim() || "Developer";
    const mockJobs = [
      { id: 101, title: `Senior ${cleanTitle}`, company: "Google (Demo)", location: "Bangalore", type: "Full-time", link: "https://google.com/careers", logo: "https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" },
      { id: 102, title: `${cleanTitle} (Remote)`, company: "Netflix (Demo)", location: "Remote", type: "Contract", link: "https://jobs.netflix.com", logo: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg" },
      { id: 103, title: `Junior ${cleanTitle}`, company: "Microsoft (Demo)", location: "Hyderabad", type: "Hybrid", link: "https://careers.microsoft.com", logo: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" }
    ];
    setJobs(mockJobs);
  };

  // Show shared view if in shared mode
  if (viewMode === "shared") {
    return (
      <div className="container">
        <header>
          <div className="logo-container"><span className="logo-icon">🚀</span></div>
          <h1>JobAlign AI</h1>
          <p className="subtitle">Shared Analysis Results</p>
        </header>

        {loading && <div className="loading">🔄 Loading shared analysis...</div>}
        {error && <div className="error-box">{error}</div>}

        {result && (
          <div className="results-grid">
            <div className="score-card">
              <h2>{result.matchScore >= 80 ? "Excellent Match! 🎯" : "Needs Improvement ⚖️"}</h2>
              
              <div className="circle-container">
                <svg viewBox="0 0 36 36" className="circular-chart">
                  <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path 
                    className="circle" 
                    strokeDasharray={`${result.matchScore}, 100`} 
                    stroke={result.matchScore >= 80 ? "#10b981" : "#f59e0b"} 
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  />
                </svg>
                <div className="percentage">{result.matchScore}%</div>
              </div>

              <button 
                onClick={() => {
                  setViewMode("upload");
                  window.history.pushState({}, '', '/');
                }}
                style={{ width: '100%', padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '20px', fontWeight: '600' }}
              >
                ✨ Analyze Your Own Resume
              </button>
            </div>

            <div className="details-card">
              <div className="detail-section">
                <h3>🔍 Missing Keywords</h3>
                <div className="badge-container">
                  {result.missingKeywords.length > 0 ? result.missingKeywords.map((kw, i) => (
                    <span key={i} className="badge">▪ {kw}</span>
                  )) : "✅ Perfect Match"}
                </div>
              </div>
              <div className="detail-section">
                <h3>💡 Actionable Feedback</h3>
                <div className="summary-box" style={{ whiteSpace: 'pre-line' }}>{result.feedback}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Normal upload view
  return (
    <div className="container">
      <header>
        <div className="logo-container"><span className="logo-icon">🚀</span></div>
        <h1>JobAlign AI</h1>
        <p className="subtitle">AI-Powered Resume Scorer</p>
      </header>

      <div className="upload-section">
        <textarea placeholder="Paste Job Description..." value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} />
        <div className="file-drop">
          <input type="file" accept=".pdf" onChange={handleFileChange} id="fileInput" style={{ display: 'none' }} />
          <label htmlFor="fileInput">{file ? `📄 ${file.name}` : "📂 Click to Upload PDF"}</label>
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="analyze-btn" onClick={handleUpload} disabled={loading}>{loading ? "🔄 Analyzing..." : "🚀 Analyze Match"}</button>
      </div>

      {result && (
        <div className="results-grid">
          <div className="score-card">
            <h2>{result.matchScore >= 80 ? "Excellent Match! 🎯" : "Needs Improvement ⚖️"}</h2>
            
            <div className="circle-container">
              <svg viewBox="0 0 36 36" className="circular-chart">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path 
                  className="circle" 
                  strokeDasharray={`${result.matchScore}, 100`} 
                  stroke={result.matchScore >= 80 ? "#10b981" : "#f59e0b"} 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                />
              </svg>
              <div className="percentage">{result.matchScore}%</div>
            </div>

            {/* FIXED Share Section */}
            {shareLink && (
              <div style={{ marginTop: '20px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.8rem', color: '#8b5cf6' }}>🔗 Share Results</p>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    alert("✅ Link copied! Share it with anyone.");
                  }}
                  style={{ width: '100%', padding: '8px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '5px' }}
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>

          <div className="details-card">
            <div className="detail-section">
              <h3>🔍 Missing Keywords</h3>
              <div className="badge-container">
                {result.missingKeywords.length > 0 ? result.missingKeywords.map((kw, i) => (
                  <span key={i} className="badge">▪ {kw}</span>
                )) : "✅ Perfect Match"}
              </div>
            </div>
            <div className="detail-section">
              <h3>💡 Actionable Feedback</h3>
              <div className="summary-box" style={{ whiteSpace: 'pre-line' }}>{result.feedback}</div>
            </div>
            <button className="secondary-btn" onClick={() => window.location.reload()}>↻ Restart</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
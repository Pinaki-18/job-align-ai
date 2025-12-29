import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError("");
    } else {
      setError("Please upload a PDF file only.");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError("");
    } else {
      setError("Please upload a PDF file only.");
    }
  };

  const handleUpload = async () => {
    if (!file || !jobDesc) {
      setError("⚠️ Please provide both a Job Description and a Resume PDF.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError("");

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      const res = await axios.post('http://localhost:5001/analyze', formData);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError("❌ Analysis failed. Please check if the server is running.");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return "#10b981";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreGrade = (score) => {
    if (score >= 90) return "Excellent Match! 🎯";
    if (score >= 80) return "Strong Match 💪";
    if (score >= 70) return "Good Match ✨";
    if (score >= 50) return "Moderate Match 📊";
    return "Needs Improvement 📝";
  };

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="logo-container">
          <span className="logo-icon">🎯</span>
          <h1>JobAlign AI</h1>
        </div>
        <p className="subtitle">
          AI-Powered Resume & Job Description Matcher
        </p>
        <div className="powered-badge">
          <span>Powered by Gemini AI ✨</span>
        </div>
      </header>

      {/* INPUT SECTION */}
      <div className="upload-section">
        <div className="section-header">
          <span className="step-number">1</span>
          <h3>Job Description</h3>
        </div>
        <textarea 
          placeholder="Paste the job description here... (e.g., Required skills: Python, React, Node.js...)"
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
        />

        <div className="section-header">
          <span className="step-number">2</span>
          <h3>Upload Resume</h3>
        </div>
        <div 
          className={`file-drop ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
            id="fileInput"
          />
          <label htmlFor="fileInput">
            {file ? (
              <div className="file-success">
                <span className="file-icon">✅</span>
                <div>
                  <p className="file-name">{file.name}</p>
                  <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
              </div>
            ) : (
              <div className="file-prompt">
                <span className="upload-icon">📄</span>
                <p className="file-prompt-text">
                  <strong>Click to upload</strong> or drag and drop
                </p>
                <p className="file-hint">PDF only • Max 10MB</p>
              </div>
            )}
          </label>
        </div>

        {error && (
          <div className="error-box">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <button 
          className="analyze-btn" 
          onClick={handleUpload} 
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner">⚙️</span>
              Analyzing Resume...
            </>
          ) : (
            <>
              <span className="btn-icon">🚀</span>
              Analyze Match
            </>
          )}
        </button>
      </div>

      {/* RESULTS SECTION */}
      {result && (
        <div className="results-grid">
          
          {/* LEFT: SCORE CIRCLE */}
          <div className="score-card">
            <div className="score-header">
              <h3 className="score-label">Match Score</h3>
              <p className="score-grade">{getScoreGrade(result.matchScore)}</p>
            </div>
            
            <div className="circle-wrapper">
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
              <div 
                className="score-glow" 
                style={{ background: `radial-gradient(circle, ${getScoreColor(result.matchScore)}40 0%, transparent 70%)` }}
              />
            </div>

            {/* Score Breakdown */}
            <div className="score-breakdown">
              <div className="score-metric">
                <span className="metric-label">Keywords Found</span>
                <span className="metric-value">
                  {Math.max(0, 10 - result.missingKeywords.length)}/10
                </span>
              </div>
              <div className="score-metric">
                <span className="metric-label">Overall Fit</span>
                <span className="metric-value">
                  {result.matchScore >= 80 ? 'High' : result.matchScore >= 50 ? 'Medium' : 'Low'}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: DETAILS */}
          <div className="details-card">
            <div className="detail-section">
              <div className="detail-header">
                <span className="detail-icon">🔍</span>
                <h3 className="detail-title">Missing Keywords</h3>
                <span className="keyword-count">{result.missingKeywords.length}</span>
              </div>
              <div className="badge-container">
                {result.missingKeywords.length > 0 ? (
                  result.missingKeywords.map((kw, i) => (
                    <span key={i} className="badge">
                      <span className="badge-dot">•</span>
                      {kw}
                    </span>
                  ))
                ) : (
                  <div className="perfect-match">
                    <span className="perfect-icon">🎉</span>
                    <p>Perfect Match! No missing keywords.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-header">
                <span className="detail-icon">🤖</span>
                <h3 className="detail-title">AI Analysis</h3>
              </div>
              <div className="summary-box">
                <p className="summary-text">{result.summary}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
              <button className="secondary-btn" onClick={() => setResult(null)}>
                ↻ Analyze Another
              </button>
              <button className="primary-btn-small" onClick={() => alert('Export feature coming soon!')}>
                📥 Export Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
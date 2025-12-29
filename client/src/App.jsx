import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]); 

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError("");
  };

  const handleUpload = async () => {
    if (!file || !jobDesc) {
      setError("⚠️ Please provide both a Job Description and a Resume PDF.");
      return;
    }
    setLoading(true);
    setResult(null);
    setJobs([]); 
    setError("");

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      // 1. Analyze Resume
      const res = await axios.post('https://job-align-ai.onrender.com/analyze', formData);
      setResult(res.data);

      // 2. Fetch Jobs (Try Real API, Fallback to Mock)
      if (res.data.searchQuery) {
        console.log("Fetching jobs for:", res.data.searchQuery);
        fetchJobs(res.data.searchQuery);
      }

    } catch (err) {
      console.error(err);
      setError("❌ Server Error: Ensure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async (query) => {
    try {
      // Try to hit the Real API
      const res = await axios.get(`https://job-align-ai.onrender.com/search-jobs?query=${encodeURIComponent(query)}`);
      
      if (res.data && res.data.length > 0) {
        // If Real Jobs found, use them
        setJobs(res.data);
      } else {
        // If API returns empty or fails, use MOCK DATA
        console.warn("⚠️ No real jobs found (Check API Key). Switching to Demo Mode.");
        useMockJobs(query);
      }
    } catch (err) {
      // If Network Error, use MOCK DATA
      console.error("Job Fetch Failed. Switching to Demo Mode.");
      useMockJobs(query);
    }
  };

  const useMockJobs = (query) => {
    // Generate realistic fake jobs based on the AI's query
    const cleanTitle = query.replace("Search query", "").replace("Remote", "").trim();
    const mockJobs = [
      {
        id: 101,
        title: "Senior " + cleanTitle,
        company: "Google (Demo)",
        location: "Bangalore, India",
        type: "Full-time",
        link: "https://www.google.com/about/careers/applications/jobs/results/",
        logo: "https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg"
      },
      {
        id: 102,
        title: cleanTitle + " (Remote)",
        company: "Netflix (Demo)",
        location: "Remote",
        type: "Contract",
        link: "https://jobs.netflix.com/",
        logo: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg"
      },
      {
        id: 103,
        title: "Junior " + cleanTitle,
        company: "Microsoft (Demo)",
        location: "Hyderabad, India",
        type: "Hybrid",
        link: "https://careers.microsoft.com/",
        logo: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
      }
    ];
    setJobs(mockJobs);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return "#10b981";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return "Excellent Match! 🎯";
    if (score >= 50) return "Good Potential ⚖️";
    return "Needs Improvement 📝";
  };

  return (
    <div className="container">
      <header>
        <div className="logo-container"><span className="logo-icon">🚀</span></div>
        <h1>JobAlign AI</h1>
        <p className="subtitle">AI-Powered Resume Scorer & Headhunter</p>
        <div className="powered-badge">Powered by Gemini AI ✨</div>
      </header>

      <div className="upload-section">
        <div className="section-header">
          <div className="step-number">1</div>
          <h3>Job Description</h3>
        </div>
        <textarea 
          placeholder="Paste the job description here..."
          value={jobDesc}
          onChange={(e) => setJobDesc(e.target.value)}
        />

        <div className="section-header">
          <div className="step-number">2</div>
          <h3>Upload Resume</h3>
        </div>
        
        <div className="file-drop">
          <input type="file" accept=".pdf" onChange={handleFileChange} id="fileInput" style={{display: 'none'}} />
          <label htmlFor="fileInput">
            {file ? <div className="file-success"><span>📄 {file.name}</span></div> : 
            <div className="file-prompt"><span className="upload-icon">📂</span><p className="file-prompt-text">Click to Upload PDF</p></div>}
          </label>
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="analyze-btn" onClick={handleUpload} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze Match"}
        </button>
      </div>

      {result && (
        <div className="results-grid">
          <div className="score-card">
            <p className="score-label">MATCH SCORE</p>
            <h2 style={{marginTop: '0.5rem', marginBottom: '2rem'}}>{getScoreLabel(result.matchScore)}</h2>
            <div className="circle-container">
              <svg viewBox="0 0 36 36" className="circular-chart">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="circle" 
                  strokeDasharray={`${result.matchScore}, 100`}
                  stroke={getScoreColor(result.matchScore)}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="percentage">{result.matchScore}%</div>
            </div>
          </div>

          <div className="details-card">
            <div className="detail-section">
              <div className="detail-header"><span style={{fontSize: '1.5rem'}}>🔍</span><h3 className="detail-title">Missing Keywords</h3></div>
              <div className="badge-container">
                {result.missingKeywords.length > 0 ? result.missingKeywords.map((kw, i) => <span key={i} className="badge">▪ {kw}</span>) : <span style={{color: '#10b981'}}>None! Perfect Match.</span>}
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-header"><span style={{fontSize: '1.5rem'}}>💡</span><h3 className="detail-title">Actionable Feedback</h3></div>
              <div className="summary-box" style={{background: 'rgba(99, 102, 241, 0.1)', borderLeft: '4px solid #8b5cf6'}}>
                <div style={{whiteSpace: 'pre-line'}}>{result.feedback}</div>
              </div>
            </div>

            {/* --- JOBS SECTION (HYBRID: REAL or DEMO) --- */}
            {jobs.length > 0 && (
              <div className="job-section">
                <div className="detail-header">
                  <span style={{fontSize: '1.5rem'}}>💼</span>
                  <h3 className="detail-title">Recommended Jobs</h3>
                </div>
                <p style={{color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem'}}>
                   AI Search Strategy: <strong style={{color: '#fff'}}>"{result.searchQuery}"</strong>
                </p>

                <div className="job-grid">
                  {jobs.map(job => (
                    <div key={job.id} className="job-card">
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start'}}>
                        <h4 className="job-role">{job.title.length > 25 ? job.title.substring(0,25)+"..." : job.title}</h4>
                        {job.logo && <img src={job.logo} alt="logo" style={{width:'30px', height:'30px', objectFit:'contain', borderRadius:'4px'}} />}
                      </div>
                      
                      <div className="job-company">
                        <span>🏢 {job.company}</span>
                        <span>📍 {job.location}</span>
                      </div>
                      
                      <div className="job-tags">
                        <span className="job-tag">{job.type}</span>
                        <span className="job-tag">Active</span>
                      </div>
                      
                      <a href={job.link} target="_blank" rel="noreferrer" className="apply-link">
                        Apply Now ↗
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ------------------------------------------- */}

            <button className="secondary-btn" onClick={() => window.location.reload()}>↻ Analyze Another</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
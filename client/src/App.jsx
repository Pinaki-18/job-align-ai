import Result from "./Result";
import { useState } from "react";
import axios from "axios";
import "./App.css";

// BACKEND URL
const API_URL =
  process.env.REACT_APP_API_URL || "https://job-align-ai.onrender.com";

function App() {
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [shareLink, setShareLink] = useState(null); // STEP 5

  const handleFileChange = e => {
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
    formData.append("resume", file);
    formData.append("jobDesc", jobDesc);

    try {
      const res = await axios.post(`${API_URL}/analyze`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });

      const parsedResult = {
        matchScore: Number(res.data.matchScore) || 0,
        missingKeywords: Array.isArray(res.data.missingKeywords)
          ? res.data.missingKeywords
          : [],
        summary: res.data.summary || "Analysis complete",
        feedback: res.data.feedback || "No feedback available",
        searchQuery: res.data.searchQuery || "",
        resumeTips: res.data.resumeTips || [],
        scoreBreakdown: res.data.scoreBreakdown || {
          strengths: [],
          partial: [],
          missing: [],
        },
      };

      setResult(parsedResult);

      // ================= STEP 5: SAVE ANALYSIS =================
      const saveRes = await axios.post(
        `${API_URL}/save-analysis`,
        parsedResult
      );

      setShareLink(
        `${window.location.origin}${saveRes.data.shareUrl}`
      );
      // =========================================================

      if (parsedResult.searchQuery) {
        await fetchJobs(parsedResult.searchQuery);
      } else {
        useMockJobs("Software Engineer");
      }
    } catch (err) {
      let msg = "Server Error. Please try again.";
      if (err.code === "ECONNABORTED") msg = "⏱️ Request timeout.";
      else if (err.response)
        msg = err.response.data?.error || msg;
      setError(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobs = async query => {
    try {
      const res = await axios.get(
        `${API_URL}/search-jobs?query=${encodeURIComponent(query)}`
      );
      if (Array.isArray(res.data) && res.data.length > 0) {
        setJobs(res.data);
      } else {
        useMockJobs(query);
      }
    } catch {
      useMockJobs(query);
    }
  };

  const useMockJobs = query => {
    const title = query || "Developer";
    setJobs([
      {
        id: 1,
        title: `Senior ${title}`,
        company: "Google (Demo)",
        location: "Bangalore",
        type: "Full-time",
        link: "https://careers.google.com/",
      },
      {
        id: 2,
        title: `${title} (Remote)`,
        company: "Netflix (Demo)",
        location: "Remote",
        type: "Contract",
        link: "https://jobs.netflix.com/",
      },
    ]);
  };

  return (
    <div className="container">
      <header>
        <h1>JobAlign AI</h1>
        <p>AI-Powered Resume Scorer</p>
      </header>

      <textarea
        placeholder="Paste Job Description"
        value={jobDesc}
        onChange={e => setJobDesc(e.target.value)}
      />

      <input type="file" accept=".pdf" onChange={handleFileChange} />

      {error && <div className="error-box">{error}</div>}

      <button onClick={handleUpload} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>

      {/* STEP 5 SHARE LINK */}
      {shareLink && (
        <div className="share-box">
          <p>🔗 Share this analysis:</p>
          <input value={shareLink} readOnly />
        </div>
      )}

      {result && <Result result={result} />}

      {jobs.length > 0 && (
        <div className="job-section">
          <h3>Recommended Jobs</h3>
          {jobs.map(job => (
            <div key={job.id}>
              <b>{job.title}</b> — {job.company}
              <a href={job.link} target="_blank" rel="noreferrer">
                Apply
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;

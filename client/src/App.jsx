import { useState } from 'react';
import './App.css'; // Make sure this file exists, or remove this line if not using it

function App() {
  const [file, setFile] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleAnalyze = async () => {
    if (!file || !jobDesc) {
      alert("Please upload a resume and paste a job description!");
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDesc', jobDesc);

    try {
      // 1. Send data to your backend server
      const response = await fetch('http://localhost:5000/analyze', {
        method: 'POST',
        body: formData,
      });

      // 2. Get the JSON response
      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        alert("Error analyzing: " + data.error);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <h1>🚀 JobAlign AI</h1>
        <p className="subtitle">Optimize your resume for any job description using Google Gemini.</p>

        <div className="input-group">
          <label>1. Upload Resume (PDF)</label>
          <input type="file" accept=".pdf" onChange={handleFileChange} />
        </div>

        <div className="input-group">
          <label>2. Paste Job Description</label>
          <textarea 
            rows="6" 
            placeholder="Paste the JD here..." 
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
          />
        </div>

        <button onClick={handleAnalyze} disabled={loading} className="analyze-btn">
          {loading ? "Analyzing... ⏳" : "Analyze Match Score ⚡"}
        </button>

        {/* Display Results */}
        {result && (
          <div className="result-section">
            <div className="score-circle">
              <span>{result.matchScore}%</span>
              <p>Match</p>
            </div>
            
            <div className="feedback">
              <h3>📝 Feedback Summary</h3>
              <p>{result.summary}</p>
              
              <h3>⚠️ Missing Keywords</h3>
              <div className="tags">
                {result.missingKeywords.map((keyword, index) => (
                  <span key={index} className="tag">{keyword}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
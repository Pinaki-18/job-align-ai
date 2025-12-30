import React from "react";

export default function Result({ result }) {
  if (!result) return null;

  const {
    matchScore,
    missingKeywords,
    summary,
    feedback,
    searchQuery,
    scoreBreakdown,
    resumeTips,
    jobs,
  } = result;

  return (
    <div className="result-container">

      {/* SCORE */}
      <h2>MATCH SCORE</h2>
      <h1>{matchScore}%</h1>

      {/* SUMMARY */}
      <p>{summary}</p>

      {/* MISSING KEYWORDS */}
      {missingKeywords && missingKeywords.length > 0 && (
        <>
          <h3>🔍 Missing Keywords</h3>
          <ul>
            {missingKeywords.map((kw, i) => (
              <li key={i}>{kw}</li>
            ))}
          </ul>
        </>
      )}

      {/* ACTIONABLE FEEDBACK */}
      {feedback && (
        <>
          <h3>💡 Actionable Feedback</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{feedback}</pre>
        </>
      )}

      {/* SCORE BREAKDOWN */}
      {scoreBreakdown && (
        <>
          <h3>📊 Why this score?</h3>

          {scoreBreakdown.strengths?.length > 0 && (
            <>
              <strong>✅ Strengths</strong>
              <ul>
                {scoreBreakdown.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}

          {scoreBreakdown.partial?.length > 0 && (
            <>
              <strong>⚠️ Partial</strong>
              <ul>
                {scoreBreakdown.partial.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}

          {scoreBreakdown.missing?.length > 0 && (
            <>
              <strong>❌ Missing</strong>
              <ul>
                {scoreBreakdown.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* STEP 4 — RESUME IMPROVEMENT TIPS */}
      {resumeTips && resumeTips.length > 0 && (
        <>
          <h3>🛠 Resume Improvement Tips</h3>
          <ul>
            {resumeTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </>
      )}

      {/* JOB SEARCH */}
      {searchQuery && (
        <>
          <h3>💼 AI Search Strategy</h3>
          <p>{searchQuery}</p>
        </>
      )}

      {/* JOBS */}
      {jobs && jobs.length > 0 && (
        <>
          <h3>Recommended Jobs</h3>
          {jobs.map((job, i) => (
            <div key={i}>
              <strong>{job.title}</strong> — {job.company}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

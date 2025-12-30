export default function Result({ result }) {
  const {
    matchScore,
    missingKeywords,
    summary,
    feedback,
    searchQuery,
    scoreBreakdown,
    resumeTips,
  } = result;

  return (
    <div style={{ marginTop: "20px" }}>
      <h3>MATCH SCORE</h3>
      <h1>{matchScore}%</h1>

      <p>{summary}</p>

      <h4>🔍 Missing Keywords</h4>
      <ul>
        {missingKeywords.map((k, i) => (
          <li key={i}>{k}</li>
        ))}
      </ul>

      <h4>💡 Actionable Feedback</h4>
      <pre>{feedback}</pre>

      <h4>📊 Score Breakdown</h4>

      <b>Strengths</b>
      <ul>
        {scoreBreakdown.strengths.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <b>Partial</b>
      <ul>
        {scoreBreakdown.partial.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>

      <b>Missing</b>
      <ul>
        {scoreBreakdown.missing.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>

      <h4>🛠 Resume Improvement Tips</h4>
      <ul>
        {resumeTips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

      <h4>💼 AI Search Strategy</h4>
      <p>{searchQuery}</p>
    </div>
  );
}

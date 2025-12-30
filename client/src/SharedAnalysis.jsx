import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import Result from "./Result";

const BACKEND = "https://YOUR-RENDER-BACKEND-URL"; // SAME AS App.jsx

export default function SharedAnalysis() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get(`${BACKEND}/analysis/${id}`).then(res => {
      setData(res.data.result);
    });
  }, [id]);

  if (!data) return <p>Loading...</p>;

  return <Result result={data} />;
}

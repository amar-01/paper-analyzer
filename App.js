import { useState, useRef, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, LinearScale, BarElement, CategoryScale } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import './App.css';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, LinearScale, BarElement, CategoryScale);

function App() {
  // Core states
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // History functionality
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('analysisHistory');
    return saved ? JSON.parse(saved) : [];
  });
  
  const fileInputRef = useRef(null);

  // Initialize from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('analysisHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large (max 10MB)");
      return;
    }

    // Reset states
    setLoading(true);
    setProgress(0);
    setError(null);
    setResults(null);
    setPreviewUrl(null);
    setActiveTab('overview');

    // Progress simulation
    const timer = setInterval(() => {
      setProgress(prev => (prev >= 90 ? 90 : prev + 10));
    }, 500);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch('http://localhost:5000/analyze', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error + (data.details ? ` (${data.details})` : ''));
      } else {
        setResults(data);
        const url = `http://localhost:5000/preview?name=${encodeURIComponent(file.name)}`;
        setPreviewUrl(url);
        
        // Add to history
        const newEntry = {
          filename: file.name,
          date: new Date().toLocaleString(),
          summary: data.summary,
          previewUrl: url,
          methodology: data.methodology,
          innovationScore: data.innovation_score,
          doi: data.doi
        };
        setHistory(prev => [newEntry, ...prev].slice(0, 5));
        localStorage.setItem('analysisHistory', JSON.stringify([newEntry, ...history]));
      }
    } catch (err) {
      setError("Failed to connect to the analyzer service");
      console.error(err);
    } finally {
      clearInterval(timer);
      setProgress(100);
      setTimeout(() => setProgress(0), 1000);
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const loadHistoryItem = (item) => {
    setResults({
      summary: item.summary,
      drawbacks: ["Reopen to view full analysis"],
      methodology: item.methodology,
      innovation_score: item.innovationScore,
      doi: item.doi
    });
    setPreviewUrl(item.previewUrl);
    setActiveTab('overview');
  };

  // Visualization Components
  const MethodologyRadar = ({ scores }) => {
    const data = {
      labels: Object.keys(scores),
      datasets: [{
        data: Object.values(scores),
        backgroundColor: [
          'rgba(67, 97, 238, 0.7)',
          'rgba(114, 9, 183, 0.7)',
          'rgba(247, 37, 133, 0.7)',
          'rgba(76, 201, 240, 0.7)',
          'rgba(72, 199, 142, 0.7)',
          'rgba(255, 193, 7, 0.7)'
        ],
        borderColor: [
          'rgba(67, 97, 238, 1)',
          'rgba(114, 9, 183, 1)',
          'rgba(247, 37, 133, 1)',
          'rgba(76, 201, 240, 1)',
          'rgba(72, 199, 142, 1)',
          'rgba(255, 193, 7, 1)'
        ],
        borderWidth: 1
      }]
    };

    return (
      <div className="visualization-card">
        <h3>Methodology Match</h3>
        <div className="chart-container">
          <Doughnut 
            data={data}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  position: 'right',
                  labels: {
                    color: darkMode ? '#f8f9fa' : '#212529'
                  }
                }
              }
            }}
          />
        </div>
      </div>
    );
  };

  const InnovationGauge = ({ score }) => {
    return (
      <div className="visualization-card">
        <h3>Innovation Score</h3>
        <div className="gauge-container">
          <div 
            className="gauge-fill"
            style={{ width: `${score}%` }}
          >
            <span>{score}%</span>
          </div>
        </div>
        <p className="gauge-description">
          {score >= 80 ? "Highly innovative" :
           score >= 60 ? "Moderately novel" :
           score >= 40 ? "Some new elements" :
           "Mainly conventional approach"}
        </p>
      </div>
    );
  };

  const CitationNetwork = ({ citations }) => {
    return (
      <div className="visualization-card">
        <h3>Citation Insights</h3>
        <div className="citation-stats">
          <div className="stat-box">
            <h4>{citations?.count || 0}</h4>
            <p>Total References</p>
          </div>
          <div className="stat-box">
            <h4>{citations?.most_cited ? citations.most_cited.substring(0, 15) + '...' : 'N/A'}</h4>
            <p>Most Cited Work</p>
          </div>
        </div>
        {citations?.top_citations?.length > 0 && (
          <div className="top-citations">
            <h4>Top References:</h4>
            <ul>
              {citations.top_citations.map((cite, i) => (
                <li key={i}>
                  <span className="citation-badge">{i + 1}</span>
                  {cite}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const DOIMetadata = ({ metadata, doi }) => {
    if (!metadata) return null;
    
    return (
      <div className="doi-card">
        <h3>
          <a 
            href={`https://doi.org/${doi}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="doi-link"
          >
            Academic Metadata ↗
          </a>
        </h3>
        <div className="doi-details">
          <p><strong>Title:</strong> {metadata.title || 'Not available'}</p>
          {metadata.authors && (
            <p><strong>Authors:</strong> {metadata.authors.join(', ')}</p>
          )}
          {metadata.journal && (
            <p><strong>Journal:</strong> {metadata.journal}</p>
          )}
          {metadata.published && (
            <p><strong>Published:</strong> {metadata.published.join('-')}</p>
          )}
          <p><strong>Citations:</strong> {metadata.citation_count || 'N/A'}</p>
          {metadata.abstract && (
            <div className="abstract">
              <h4>Abstract</h4>
              <p>{metadata.abstract.substring(0, 200)}...</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <div className="header">
        <h1>Research Paper Analyzer</h1>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="mode-toggle"
        >
          {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </div>
      
      <div className="upload-section">
        <input
          type="file"
          accept=".pdf"
          onChange={handleUpload}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <button 
          onClick={triggerFileInput}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Choose PDF File'}
        </button>
        <p className="file-requirements">(Max 50 pages, 10MB)</p>
        
        {loading && (
          <div className="loading-animation">
            <div className="particles">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="particle" style={{
                  '--i': i,
                  '--color': `hsl(${i * 30}, 80%, 60%)`
                }} />
              ))}
            </div>
            <div className="neon-text">
              <span style={{ '--delay': '0s' }}>D</span>
              <span style={{ '--delay': '0.1s' }}>e</span>
              <span style={{ '--delay': '0.2s' }}>e</span>
              <span style={{ '--delay': '0.3s' }}>p</span>
              <span style={{ '--delay': '0.4s' }}> </span>
              <span style={{ '--delay': '0.5s' }}>A</span>
              <span style={{ '--delay': '0.6s' }}>n</span>
              <span style={{ '--delay': '0.7s' }}>a</span>
              <span style={{ '--delay': '0.8s' }}>l</span>
              <span style={{ '--delay': '0.9s' }}>y</span>
              <span style={{ '--delay': '1s' }}>s</span>
              <span style={{ '--delay': '1.1s' }}>i</span>
              <span style={{ '--delay': '1.2s' }}>s</span>
            </div>
            <div className="progress-track">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              >
                <div className="progress-glow" />
              </div>
            </div>
            <p className="file-requirements">Extracting insights from your research...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <p>⚠️ {error}</p>
          {error.includes("scanned") && (
            <p>Try a text-based PDF or use OCR software first.</p>
          )}
        </div>
      )}

      {results && (
        <div className="results-container">
          <div className="tabs">
            <button
              className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`tab-button ${activeTab === 'advanced' ? 'active' : ''}`}
              onClick={() => setActiveTab('advanced')}
            >
              Advanced Analysis
            </button>
            <button
              className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              PDF Preview
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="tab-content">
              {results.doi && (
                <DOIMetadata metadata={results.doi_metadata} doi={results.doi} />
              )}

              <div className="summary-section">
                <h2>Summary</h2>
                <p>{results.summary}</p>
              </div>

              <div className="drawbacks-section">
                <h2>Potential Drawbacks</h2>
                <ul>
                  {results.drawbacks.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="quick-stats">
                <div className="visualization-card">
                  <h3>Research Approach</h3>
                  <div className="methodology-description">
                    <p>{results.methodology || "Methodology not specified"}</p>
                  </div>
                </div>
                <InnovationGauge score={results.innovation_score} />
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="tab-content">
              <div className="enhanced-results">
                <MethodologyRadar scores={results.similarity_scores} />
                <CitationNetwork citations={{
                  count: results.citation_count,
                  most_cited: results.most_cited,
                  top_citations: results.top_citations
                }} />
              </div>
            </div>
          )}

          {activeTab === 'preview' && previewUrl && (
            <div className="tab-content">
              <div className="pdf-preview">
                <iframe 
                  src={previewUrl}
                  width="100%"
                  height="600px"
                  title="PDF preview"
                />
                <a 
                  href={previewUrl} 
                  download
                  className="download-button"
                >
                  Download Original PDF
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="history-section">
          <h2>Recent Analyses</h2>
          <ul>
            {history.map((item, index) => (
              <li key={index}>
                <button 
                  onClick={() => loadHistoryItem(item)}
                  className="history-item"
                >
                  <span className="history-filename">{item.filename}</span>
                  <span className="history-date">{item.date}</span>
                  {item.doi && (
                    <span className="doi-badge">DOI</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
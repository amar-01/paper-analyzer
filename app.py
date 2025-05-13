from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from pdf2image import convert_from_bytes
import PyPDF2, io, re, os, requests
from transformers import pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from PIL import Image
import pytesseract
import tempfile

app = Flask(__name__)
CORS(app)

# Configure Tesseract OCR
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'  # Update for your OS

# Load AI models
summarizer = pipeline(
    "summarization", 
    model="sshleifer/distilbart-cnn-12-6",
    device=-1
)

qa_pipeline = pipeline(
    "question-answering",
    model="deepset/roberta-base-squad2",
    device=-1
)

# Sample research corpus for similarity analysis
RESEARCH_CORPUS = {
    "experimental": "Studies using controlled experiments with quantitative measurements and statistical analysis...",
    "theoretical": "Papers developing new theoretical frameworks, mathematical models, or conceptual analyses...",
    "review": "Literature reviews systematically synthesizing existing research findings...",
    "simulation": "Research employing computational simulations, agent-based models, or numerical methods...",
    "qualitative": "Studies using interviews, case studies, or ethnographic methods with qualitative data...",
    "mixed_methods": "Research combining quantitative and qualitative approaches in integrated analysis..."
}

def fetch_doi_metadata(doi):
    """Fetch paper metadata from CrossRef"""
    try:
        url = f"https://api.crossref.org/works/{doi}"
        headers = {
            "User-Agent": "ResearchPaperAnalyzer/1.0 (mailto:your@email.com)"
        }
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return {
                "title": data['message'].get('title', [''])[0],
                "authors": [author.get('given', '') + ' ' + author.get('family', '') 
                          for author in data['message'].get('author', [])][:5],
                "journal": data['message'].get('container-title', [''])[0],
                "published": data['message'].get('created', {}).get('date-parts', [[]])[0],
                "citation_count": data['message'].get('is-referenced-by-count', 0),
                "abstract": data['message'].get('abstract', '')
            }
    except Exception as e:
        print(f"DOI lookup failed: {str(e)}")
    return None

def extract_text(pdf_bytes):
    """Extract text with OCR fallback"""
    try:
        with io.BytesIO(pdf_bytes) as f:
            reader = PyPDF2.PdfReader(f)
            text = " ".join([page.extract_text() or "" for page in reader.pages])
        
        if len(text) < 100:  # Likely scanned PDF
            images = convert_from_bytes(pdf_bytes)
            text = " ".join([pytesseract.image_to_string(img) for img in images])
        
        text = re.sub(r'\s+', ' ', text).strip()
        return text if len(text) > 50 else None
    
    except Exception as e:
        print(f"Extraction error: {str(e)}")
        return None

def analyze_content(text):
    """Core analysis pipeline"""
    # Summary
    summary = summarizer(
        text[:2000], 
        max_length=150, 
        min_length=50,
        do_sample=False
    )[0]['summary_text']
    
    # Drawbacks
    drawbacks = identify_drawbacks(text)
    
    # Enhanced analysis
    enhanced = enhanced_analysis(text)
    
    # DOI Extraction
    doi = None
    doi_match = re.search(r'\b(10[.][0-9]{4,}(?:[.][0-9]+)*/(?:(?!["&\'<>])\S)+)\b', text)
    if doi_match:
        doi = doi_match.group(1)
        enhanced['doi_metadata'] = fetch_doi_metadata(doi)
        enhanced['doi'] = doi
    
    return {
        "summary": summary,
        "drawbacks": drawbacks,
        **enhanced
    }

def identify_drawbacks(text):
    """Hybrid drawback detection"""
    drawbacks = set()
    
    # QA Approach
    questions = [
        "What are the limitations of this study?",
        "What are the weaknesses of the methodology?",
        "What future work is suggested?"
    ]
    for q in questions:
        try:
            ans = qa_pipeline(question=q, context=text[:5000])
            if ans['score'] > 0.4:
                drawbacks.add(ans['answer'].strip('. '))
        except:
            continue
    
    # Pattern Matching
    patterns = [
        r"limitation[s]? (?:are|include)[\s\w,]+",
        r"however[, ]+(?:we|this|the)[\s\w]+",
        r"future work should[\s\w]+"
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        drawbacks.update(matches)
    
    return list(drawbacks)[:5] or [
        "No major limitations explicitly stated",
        "Methodology appears sound but lacks comparative validation"
    ]

def enhanced_analysis(text):
    """Next-level analysis features"""
    # Methodology detection
    methodology = qa_pipeline(
        question="What methodology is used? Answer in 15 words maximum.",
        context=text[:5000]
    )
    
    # Innovation scoring
    innovation = qa_pipeline(
        question="What is novel about this approach? Answer in 20 words maximum.",
        context=text[:5000]
    )
    
    # Citation analysis
    citations = extract_citations(text)
    
    # Similarity scoring
    similarity = calculate_similarity(text)
    
    return {
        "methodology": methodology['answer'],
        "innovation": innovation['answer'],
        "innovation_score": round(innovation['score'] * 100),
        "citation_count": citations['count'],
        "most_cited": citations['most_cited'],
        "top_citations": citations['top_5'],
        "similarity_scores": similarity
    }

def extract_citations(text):
    """Advanced citation parsing"""
    citations = re.findall(
        r'(?:\(|\[)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+&?\s+[A-Z][a-z]+)*,\s*(?:19|20)\d{2}[a-z]?)(?:\)|\])', 
        text
    )
    top_cited = sorted(set(citations), key=lambda x: (-citations.count(x), x))[:5]
    
    return {
        "count": len(citations),
        "most_cited": max(set(citations), key=citations.count) if citations else None,
        "top_5": top_cited
    }

def calculate_similarity(text):
    """Compare to research corpus"""
    vectorizer = TfidfVectorizer(stop_words='english')
    texts = [text[:5000]] + list(RESEARCH_CORPUS.values())
    tfidf = vectorizer.fit_transform(texts)
    
    similarities = cosine_similarity(tfidf[0:1], tfidf[1:]).flatten()
    
    return {
        method: round(score * 100, 1)
        for method, score in zip(RESEARCH_CORPUS.keys(), similarities)
    }

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'pdf' not in request.files:
        return jsonify({"error": "No PDF uploaded"}), 400
    
    try:
        # Save PDF temporarily
        pdf_file = request.files['pdf']
        temp_path = os.path.join(tempfile.gettempdir(), pdf_file.filename)
        pdf_file.save(temp_path)
        
        # Process content
        with open(temp_path, 'rb') as f:
            text = extract_text(f.read())
        
        if not text:
            return jsonify({
                "error": "Failed to extract text",
                "solution": "This may be a scanned PDF or image-heavy document"
            }), 400
        
        results = analyze_content(text)
        results["preview_url"] = f"/preview?name={pdf_file.filename}"
        
        return jsonify(results)
        
    except Exception as e:
        return jsonify({
            "error": "Processing failed",
            "details": str(e)
        }), 500

@app.route('/preview')
def preview():
    """Serve PDF for preview"""
    name = request.args.get('name')
    temp_path = os.path.join(tempfile.gettempdir(), name)
    return send_file(temp_path, mimetype='application/pdf')

if __name__ == '__main__':
    app.run(port=5000, threaded=True)
"use client";
import { useState, useRef } from "react";
import Header from "./components/Header";
import CodeEditor from "./components/CodeEditor";
import AnalysisPopup from "./components/AnalysisPopup";
import { toast } from "react-toastify";

export default function Home() {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("javascript");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isPopupOpen, setIsPopupOpen] = useState<boolean>(false);
  const [popupContent, setPopupContent] = useState<string>("");
  const [popupTitle, setPopupTitle] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisType, setAnalysisType] = useState<'complexity' | 'suggestions' | 'optimize'>('complexity');
  
  const codeEditorRef = useRef<{ getCode: () => string } | null>(null);

  const handleComplexityAnalysis = async () => {
    // Get code from CodeEditor
    const code = codeEditorRef.current?.getCode();
    
    if (!code || code.trim() === "") {
      toast.warning("Please write some code first!", {
        position: "top-center",
        autoClose: 3000,
      });
      return;
    }

    setAnalysisType('complexity');
    setPopupTitle("Time & Space Complexity Analysis");
    setPopupContent("");
    setIsPopupOpen(true);
    setIsLoading(true);

    try {
      const response = await fetch('/api/complexity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: selectedLanguage })
      });

      const data = await response.json();

      if (response.ok) {
        setPopupContent(data.analysis);
      } else {
        setPopupContent(`**Error**: ${data.error || 'Failed to analyze code'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      setPopupContent(`**Error**: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestions = async () => {
    // Get code from CodeEditor
    const code = codeEditorRef.current?.getCode();
    
    if (!code || code.trim() === "") {
      toast.warning("Please write some code first!", {
        position: "top-center",
        autoClose: 3000,
      });
      return;
    }

    setAnalysisType('optimize');
    setPopupTitle("Code Optimization Analysis");
    setPopupContent("");
    setIsPopupOpen(true);
    setIsLoading(true);

    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: selectedLanguage })
      });

      const data = await response.json();

      if (response.ok) {
        setPopupContent(data.suggestions);
      } else {
        setPopupContent(`**Error**: ${data.error || 'Failed to analyze optimization'}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      setPopupContent(`**Error**: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main role="main" itemScope itemType="https://schema.org/WebApplication">
      <meta itemProp="name" content="Syntaxist Online Compiler" />
      <meta itemProp="description" content="online code compiler supporting 10+ programming languages" />
      <meta itemProp="applicationCategory" content="DeveloperApplication" />
      <meta itemProp="operatingSystem" content="Web Browser" />
      
      {/* SEO Content - Hidden but crawlable */}
      <div className="sr-only" aria-hidden="true">
        <h1>Syntaxist - Free Online Code Compiler with AI Analysis</h1>
        <p>
          Run and execute code online in Python, JavaScript, C++, Java, Go, Rust, Ruby, PHP, Swift, and C#. 
          Free online compiler with AI-powered time complexity and space complexity analysis.
        </p>
        <h2>Supported Programming Languages</h2>
        <ul>
          <li>Python Online Compiler - Run Python code instantly</li>
          <li>JavaScript Online Compiler - Execute JavaScript in browser</li>
          <li>C++ Online Compiler - Compile and run C++ programs</li>
          <li>Java Online Compiler - Run Java code online</li>
          <li>Go Programming Compiler - Execute Go language code</li>
          <li>Rust Online Compiler - Run Rust programs</li>
          <li>Ruby Online Compiler - Execute Ruby scripts</li>
          <li>PHP Online Compiler - Run PHP code</li>
          <li>Swift Online Compiler - Test Swift code</li>
          <li>C# Online Compiler - Run C# programs</li>
        </ul>
        <h2>AI-Powered Features</h2>
        <ul>
          <li>Time Complexity Analysis - Automatic Big O notation calculation</li>
          <li>Space Complexity Analysis - Memory usage optimization</li>
          <li>Code Optimization - AI-powered suggestions to improve performance</li>
          <li>Real-time Execution - Instant code compilation and output</li>
        </ul>
      </div>
      
      <CodeEditor
        ref={codeEditorRef}
        selectedLanguage={selectedLanguage} 
        isDarkMode={isDarkMode}
      />
      <Header
        selectedLanguage={selectedLanguage} 
        setSelectedLanguage={setSelectedLanguage}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onComplexityClick={handleComplexityAnalysis}
        onSuggestionsClick={handleSuggestions}
      />
      <AnalysisPopup
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
        title={popupTitle}
        content={popupContent}
        isLoading={isLoading}
        type={analysisType}
      />
    </main>
  );
}

import { v4 as uuidv4 } from 'uuid';
import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import formImage from './img.png';


function App() {
  const chatSessionIdRef = useRef(
  sessionStorage.getItem("chatSessionId") || (() => {
    const newId = uuidv4();
    sessionStorage.setItem("chatSessionId", newId);
    return newId;
  })()
  );

  const [step, setStep] = useState('form'); // 'form' or 'chatbot'
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'Male',
    department: 'Fever and Cold', // Default department
    language: 'English', // New field for language
  });
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true); // State for quick action buttons
  const messagesEndRef = useRef(null);
  const [chatHistoryId, setChatHistoryId] = useState(null); // New state to store chat_history_id
  const [lastQuestionId, setLastQuestionId] = useState(null); // New state to store last_question_id
  

  // Voice-related states (STT only)
  const [isRecording, setIsRecording] = useState(false);
  const [isFormRecording, setIsFormRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false); // New state for audio processing
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // NEW: TTS-related states
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [currentPlayingAudio, setCurrentPlayingAudio] = useState(null);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState(null);
  const audioRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (step === 'chatbot') scrollToBottom();
  }, [messages, step]);

  // Initialize chatbot with welcome message when switching to chatbot
  useEffect(() => {
    if (step === 'chatbot' && messages.length === 0) {
      const welcomeMessage = {
        role: 'assistant',
        content: `Hey ${formData.name}! 👋 I'm here to help you with your health concerns. I can assist you with:\n\n🔍 Health Diagnosis - Analyze your symptoms\n📅 Appointment Suggestions - Recommend specialists\n📞 Appointment Booking - Help schedule visits\n\nHow can I help you today?`
      };
      setMessages([welcomeMessage]);
    }
  }, [step, formData.name, messages.length]);

  // NEW: Text-to-Speech functionality
  const speakText = async (text, messageIndex = null) => {
    try {
      // Stop any currently playing audio
      if (currentPlayingAudio) {
        currentPlayingAudio.pause();
        currentPlayingAudio.currentTime = 0;
      }

      setIsLoadingTTS(true);
      setIsSpeaking(true);
      setSpeakingMessageIndex(messageIndex);

      // Create FormData for TTS request
      const formData = new FormData();
      formData.append('text', text);
      formData.append('language', formData.language || 'English');

      console.log('🔊 Sending text to TTS backend...');
      
      // Use the streaming endpoint for better performance
      const response = await fetch('https://health-chatbot-backend-fjejfab8hsd7erd6.centralindia-01.azurewebsites.net/synthesize_stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      // Create audio blob from response
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setCurrentPlayingAudio(audio);

      // Set up event listeners
      audio.onloadeddata = () => {
        setIsLoadingTTS(false);
        console.log('🎵 TTS audio loaded, starting playback...');
      };

      audio.onplay = () => {
        console.log('🎵 TTS playback started');
      };

      audio.onended = () => {
        console.log('🎵 TTS playback ended');
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setCurrentPlayingAudio(null);
        URL.revokeObjectURL(audioUrl); // Clean up blob URL
      };

      audio.onerror = (error) => {
        console.error('🔊 TTS Audio playback error:', error);
        setIsSpeaking(false);
        setSpeakingMessageIndex(null);
        setIsLoadingTTS(false);
        setCurrentPlayingAudio(null);
        URL.revokeObjectURL(audioUrl);
      };

      // Start playing
      await audio.play();

    } catch (error) {
      console.error('🔊 TTS Error:', error);
      setIsSpeaking(false);
      setSpeakingMessageIndex(null);
      setIsLoadingTTS(false);
      setCurrentPlayingAudio(null);
      
      // User-friendly error messages
      if (error.message.includes('TTS request failed')) {
        alert('Speech synthesis failed. Please try again.');
      } else {
        alert(`Error converting text to speech: ${error.message}`);
      }
    }
  };

  // NEW: Stop TTS playback
  const stopSpeaking = () => {
    if (currentPlayingAudio) {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    }
    setIsSpeaking(false);
    setSpeakingMessageIndex(null);
    setCurrentPlayingAudio(null);
  };

  // UPDATED: Enhanced start recording function with your STT integration
  const startRecording = async (isFormRecording = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToBackend(audioBlob, isFormRecording);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      
      if (isFormRecording) {
        setIsFormRecording(true);
      } else {
        setIsRecording(true);
      }
      
      console.log('🎤 Recording started...');
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      // More specific error messages
      if (error.name === 'NotAllowedError') {
        alert('Microphone access denied. Please allow microphone permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.');
      } else {
        alert(`Error accessing microphone: ${error.message}`);
      }
    }
  };

  // UPDATED: Enhanced stop recording function
  const stopRecording = (isFormRecording = false) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      console.log('🛑 Recording stopped...');
    }
    
    if (isFormRecording) {
      setIsFormRecording(false);
    } else {
      setIsRecording(false);
    }
  };

  // UPDATED: Enhanced audio processing with your STT backend
  const sendAudioToBackend = async (audioBlob, isFormRecording = false) => {
    // Show processing state
    setIsProcessingAudio(true);
    
    if (isFormRecording) {
      console.log('🔄 Processing form audio...');
    } else {
      console.log('🔄 Processing chat audio...');
    }

    const formDataAudio = new FormData();
    formDataAudio.append('audio', audioBlob, 'recording.webm');
    formDataAudio.append('language', formData.language);

    try {
      console.log('📤 Sending audio to your STT backend...');
      
      const response = await fetch('https://health-chatbot-backend-fjejfab8hsd7erd6.centralindia-01.azurewebsites.net/transcribe', {
        method: 'POST',
        body: formDataAudio,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: Transcription failed`);
      }

      const data = await response.json();
      const transcribedText = data.transcription;

      console.log('✅ Transcription successful:', transcribedText);

      if (isFormRecording) {
        // Update the department field with transcribed text
        setFormData(prev => ({
          ...prev,
          department: transcribedText
        }));
        
        console.log('✅ Form field updated with voice input');
        
      } else {
        // Set the transcribed text as input in chat
        setInput(transcribedText);
        console.log('✅ Chat input updated with voice input');
      }
      
    } catch (error) {
      console.error('❌ Error transcribing audio:', error);
      
      // More specific error handling
      if (error.message.includes('No speech detected')) {
        alert('No speech detected in the recording. Please try speaking clearly and try again.');
      } else if (error.message.includes('Transcription failed')) {
        alert('Speech recognition failed. Please try again with clearer audio.');
      } else {
        alert(`Error processing voice input: ${error.message}`);
      }
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const handleFormSubmit = () => {
    if (!formData.name || !formData.age || !formData.department || !formData.language) {
      alert('Please fill all the fields before proceeding.');
      return;
    }
    // const newSessionId = uuidv4();       // 👈 generate new session_id
    // setChatSessionId(newSessionId);        // 👈 store it in new state
    setStep('chatbot');
  };

  // Function to go back to form
  const handleBackToForm = () => {
    sessionStorage.removeItem("chatSessionId");              // Clear old session
    chatSessionIdRef.current = uuidv4();                     // Generate new
    sessionStorage.setItem("chatSessionId", chatSessionIdRef.current); // Store it

    setStep('form');
    setMessages([]); // Clear messages when going back
    setShowQuickActions(true); // Reset quick actions
    
    setLastQuestionId(null); // Reset question ID
    stopSpeaking(); // Stop any playing TTS
  };

  // Quick action handlers
  const handleQuickAction = (action) => {
    let quickMessage = '';
    switch (action) {
      case 'diagnosis':
        quickMessage = 'I need help with health diagnosis. Can you analyze my symptoms?';
        break;
      case 'appointment':
        quickMessage = 'I would like appointment suggestions based on my condition.';
        break;
      case 'booking':
        quickMessage = 'I want to book an appointment with a specialist.';
        break;
      default:
        return;
    }
    
    setInput(quickMessage);
    setShowQuickActions(false); // Hide quick actions after first use
    setLastQuestionId(null); // Clear lastQuestionId on quick action
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setShowQuickActions(false);

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const messagesToSend = [...messages, userMessage];

    try {
      const response = await fetch('https://health-chatbot-backend-fjejfab8hsd7erd6.centralindia-01.azurewebsites.net/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_input: input,
          department: formData.department,
          conversation_history: messagesToSend,
          language: formData.language,
          name: formData.name,
          age: formData.age,
          gender: formData.gender,
          chat_history_id: chatHistoryId,
          session_id: chatSessionIdRef.current,         //this is give a session_id for mnake differences in the user chats
          last_question_id: lastQuestionId
        }),
      });

      const data = await response.json();
      let newMessages = [...messagesToSend];

      // --- CRITICAL FIX FOR FLOW MARKER ---
      const hasFlowMarker = messagesToSend.some(
        (msg) => msg.role === 'system' && msg.content.startsWith('selected_flow:')
      );

      if (!hasFlowMarker) {
          const lowerInput = input.trim().toLowerCase();
          if (lowerInput.includes("diagnosis")) {
              newMessages.push({ role: 'system', content: `selected_flow: diagnosis` });
          } else if (lowerInput.includes("appointment")) {
              newMessages.push({ role: 'system', content: `selected_flow: appointment` });
          }
      }
      // --- END CRITICAL FIX ---
      
      // Add the assistant's response to the new messages array
      const assistantMessage = { role: 'assistant', content: data.response };
      newMessages.push(assistantMessage);

      // Store IDs from response
      if (data.chat_history_id) {
        setChatHistoryId(data.chat_history_id);
      }
      if (data.question_id) {
        setLastQuestionId(data.question_id);
      } else {
        // If no new question is returned, clear lastQuestionId
        // This is important so future *non-answer* inputs don't try to save an answer
        setLastQuestionId(null);
      }

      setMessages(newMessages);

    } catch (error) {
      console.error('Error:', error);
      const errorMessage = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: errorMessage },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateOfflineReport = async () => {
    if (!formData.name || !formData.age || !formData.department || !formData.language) {
      alert('Please fill all the fields before generating the offline report.');
      return;
    }

    const responses = [
      { questionId: 1, option: 'A' },
      { questionId: 2, option: 'C' },
      { questionId: 3, option: 'B' },
      { questionId: 4, option: 'D' },
      { questionId: 5, option: 'A' },
    ];

    setIsLoading(true);
    try {
      const response = await fetch('https://health-chatbot-backend-fjejfab8hsd7erd6.centralindia-01.azurewebsites.net/generate_offline_report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          age: formData.age,
          gender: formData.gender,
          department: formData.department,
          language: formData.language,
          responses: responses,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate offline report.');
      }

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'offline_report.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Offline Report Error:', error);
      alert('Failed to generate offline report.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Medical Chatbot</h1>
      </header>
      
      {/* Recording Indicator */}
      {(isRecording || isFormRecording || isProcessingAudio) && (
        <div className="recording-indicator">
          <div className="recording-animation">
            {isProcessingAudio ? '🔄' : '🎤'}
          </div>
          <span>
            {isProcessingAudio ? 'Processing audio...' : 'Recording... Speak clearly'}
          </span>
        </div>
      )}

      {/* TTS Indicator */}
      {(isSpeaking || isLoadingTTS) && (
        <div className="tts-indicator">
          <div className="tts-animation">
            {isLoadingTTS ? '🔄' : '🔊'}
          </div>
          <span>
            {isLoadingTTS ? 'Generating speech...' : 'Playing audio...'}
          </span>
          {isSpeaking && (
            <button className="stop-tts-btn" onClick={stopSpeaking}>
              🛑 Stop
            </button>
          )}
        </div>
      )}
      
      {step === 'form' ? (
        <div className="form-container">
          <img src={formImage} alt="Medical Illustration" className="form-image" />
          <div>
            <h2>Enter Your Details</h2>
            <form>
              <label>
                Name:
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </label>
              <label>
                Age:
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                />
              </label>
              <label>
                Gender:
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>
                Problem:
                <div className="input-with-mic">
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                  <button
                    type="button"
                    className={`mic-button ${isFormRecording ? 'recording' : ''} ${isProcessingAudio ? 'disabled' : ''}`}
                    onClick={() => isFormRecording ? stopRecording(true) : startRecording(true)}
                    disabled={isProcessingAudio}
                    title={
                      isProcessingAudio 
                        ? 'Processing audio...' 
                        : isFormRecording 
                          ? 'Stop Recording' 
                          : 'Start Voice Input'
                    }
                  >
                    {isProcessingAudio ? '⏳' : (isFormRecording ? '🛑' : '🎤')}
                  </button>
                </div>
              </label>
              <label>
                Language:
                <select
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                >
                  <option value="English">English</option>
                  <option value="Hindi">हिंदी</option>
                  <option value="Telugu">తెలుగు</option>
                </select>
              </label>
              <div className="form-buttons">
                <button type="button" onClick={handleFormSubmit}>
                  Open Chatbot
                </button>
                <button type="button" onClick={generateOfflineReport}>
                  Offline Report
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="chat-container">
            {/* Back Button */}
            <div className="back-button-container">
              <button onClick={handleBackToForm} className="back-button">
                ← Back
              </button>
            </div>

            <div className="chat-box">
            <div className="messages">
              {messages.map((msg, index) => (
                // Only render messages that are not of role 'system'
                msg.role !== 'system' && (
                  <div key={index} className={`message ${msg.role}`}>
                    <div className="message-content">
                      {msg.content}
                    </div>
                    {/* TTS Button for assistant messages */}
                    {msg.role === 'assistant' && (
                      <div className="message-actions">
                        <button
                          className={`tts-button ${speakingMessageIndex === index ? 'speaking' : ''}`}
                          onClick={() => speakText(msg.content, index)}
                          disabled={isLoadingTTS}
                          title={speakingMessageIndex === index ? 'Currently speaking' : 'Listen to this message'}
                        >
                          {isLoadingTTS && speakingMessageIndex === index ? '⏳' : 
                           speakingMessageIndex === index ? '🔊' : '🔉'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              ))}
              
              {/* Quick Action Buttons */}
              {showQuickActions && (
                <div className="quick-actions">
                  <p className="quick-actions-title">Quick Actions:</p>
                  <div className="quick-actions-buttons">
                    <button 
                      className="quick-action-btn diagnosis-btn"
                      onClick={() => handleQuickAction('diagnosis')}
                    >
                      🔍 Health Diagnosis
                    </button>
                    <button 
                      className="quick-action-btn appointment-btn"
                      onClick={() => handleQuickAction('appointment')}
                    >
                      📅 Appointment Suggestion
                    </button>
                    <button 
                      className="quick-action-btn booking-btn"
                      onClick={() => handleQuickAction('booking')}
                    >
                      📞 Book Appointment
                    </button>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
              {isLoading && <div className="message assistant typing">Typing...</div>}
            </div>

            <form onSubmit={handleSubmit} className="input-area">
              <div className="input-with-mic">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your symptoms or use voice input..."
                  disabled={isLoading || isProcessingAudio}
                />
                <button
                  type="button"
                  className={`mic-button ${isRecording ? 'recording' : ''} ${(isLoading || isProcessingAudio) ? 'disabled' : ''}`}
                  onClick={() => isRecording ? stopRecording() : startRecording()}
                  disabled={isLoading || isProcessingAudio}
                  title={
                    isLoading || isProcessingAudio
                      ? 'Processing...' 
                      : isRecording 
                        ? 'Stop Recording' 
                        : 'Start Voice Input'
                  }
                >
                  {isLoading || isProcessingAudio ? '⏳' : (isRecording ? '🛑' : '🎤')}
                </button>
              </div>
              <button type="submit" disabled={isLoading || isProcessingAudio}>
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
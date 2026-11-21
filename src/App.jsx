import { useState, useEffect, useRef } from 'react'
import './App.css'
import { auth, googleProvider } from './firebase'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth'

function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [chats, setChats] = useState([])

  const [activeId, setActiveId] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [search, setSearch] = useState('')
  const [plusOpen, setPlusOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [thinkHarder, setThinkHarder] = useState(false)
  const [webSearch, setWebSearch] = useState(false)

  const photoRef = useRef(null)
  const cameraRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser)

      if (currentUser) {
        try {
          const saved = localStorage.getItem(
            `chatabi_chats_${currentUser.uid}`
          )
          setChats(saved ? JSON.parse(saved) : [])
        } catch {
          setChats([])
        }
      } else {
        setChats([])
      }

      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (user && !authLoading) {
      localStorage.setItem(
        `chatabi_chats_${user.uid}`,
        JSON.stringify(chats)
      )
    }
  }, [chats, user, authLoading])

  async function loginWithGoogle() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      alert('Google Login Error: ' + error.message)
    }
  }

  async function logout() {
    try {
      stopSpeaking()
      await signOut(auth)
    } catch (error) {
      alert('Logout Error: ' + error.message)
    }
  }

  const activeChat = chats.find(c => c.id === activeId)
  const messages = activeChat?.messages || []

  function speakReply(text) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    const speech = new SpeechSynthesisUtterance(text)
    speech.lang = /[\u0980-\u09FF]/.test(text)
      ? 'bn-BD'
      : /[\u0600-\u06FF]/.test(text) ? 'ar-SA' : 'en-US'

    speech.onstart = () => setSpeaking(true)
    speech.onend = () => setSpeaking(false)
    speech.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(speech)
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'bn-BD'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.onresult = event => {
      const result = event.results[0][0].transcript
      setMessage(prev => prev ? prev + ' ' + result : result)
    }

    recognition.start()
  }

  function newChat() {
    stopSpeaking()
    setActiveId(null)
    setMessage('')
    setAttachments([])
  }

  function updateMessages(id, newMessages) {
    setChats(prev =>
      prev.map(chat =>
        chat.id === id ? { ...chat, messages: newMessages } : chat
      )
    )
  }

  function addFiles(event) {
    const selected = Array.from(event.target.files || [])
    setAttachments(prev => [...prev, ...selected])
    event.target.value = ''
    setPlusOpen(false)
  }

  function removeFile(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: reader.result.split(',')[1]
      })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function sendMessage() {
    if ((!message.trim() && !attachments.length) || loading) return

    const userMessage = message.trim() || 'Please analyze the attached file.'
    const selectedFiles = [...attachments]

    setMessage('')
    setAttachments([])
    setPlusOpen(false)
    stopSpeaking()
    setLoading(true)

    let id = activeId

    if (!id) {
      id = Date.now()
      setActiveId(id)
      setChats(prev => [
        ...prev,
        {
          id,
          title: userMessage.slice(0, 30) || 'New Chat',
          messages: []
        }
      ])
    }

    const currentChat = chats.find(c => c.id === id)
    const oldMessages = currentChat?.messages || []

    const updated = [
      ...oldMessages,
      {
        role: 'user',
        text: userMessage,
        files: selectedFiles.map(file => file.name)
      }
    ]

    updateMessages(id, updated)

    try {
      const uploadedFiles = await Promise.all(selectedFiles.map(fileToBase64))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          attachments: uploadedFiles,
          thinkHarder,
          webSearch
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI Error')

      const reply = data.reply || 'No response generated.'

      updateMessages(id, [...updated, { role: 'ai', text: reply }])
      speakReply(reply)

    } catch (error) {
      updateMessages(id, [
        ...updated,
        { role: 'ai', text: 'Error: ' + error.message }
      ])
    } finally {
      setLoading(false)
    }
  }

  function renameChat(id) {
    const chat = chats.find(c => c.id === id)
    const title = prompt('Enter new chat name:', chat?.title || '')
    if (!title?.trim()) return

    setChats(prev =>
      prev.map(c => c.id === id ? { ...c, title: title.trim() } : c)
    )
  }

  function deleteChat(id) {
    if (!confirm('Delete this chat?')) return
    setChats(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <h2>ChatABi is loading...</h2>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#101018',
        color: 'white',
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '380px',
          textAlign: 'center',
          padding: '30px 20px',
          borderRadius: '18px',
          background: '#1d1d29'
        }}>
          <div style={{ fontSize: '52px' }}>🤖</div>
          <h1>Welcome to ChatABi</h1>
          <p>Sign in with Google to start chatting.</p>
          <button
            onClick={loginWithGoogle}
            style={{
              width: '100%',
              padding: '14px',
              marginTop: '18px',
              border: 'none',
              borderRadius: '10px',
              background: 'white',
              color: '#222',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-top">
          <h2>ChatABi</h2>
          <button className="new-chat" onClick={newChat}>+ New Chat</button>
          <input
            placeholder="Search chats..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <p className="history-title">Chat History</p>

        {chats
          .filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
          .map(chat => (
            <div
              className="history-item"
              key={chat.id}
              onClick={() => setActiveId(chat.id)}
            >
              <span>{chat.title}</span>
              <button onClick={e => {
                e.stopPropagation()
                renameChat(chat.id)
              }}>✏️</button>
              <button onClick={e => {
                e.stopPropagation()
                deleteChat(chat.id)
              }}>🗑️</button>
            </div>
          ))}
      </aside>

      <main className="main-area">
        <header className="header">
          <h2>ChatABi</h2>
          <span className="online">● Online</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px' }}>
              {user.displayName || user.email}
            </span>
            <button onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="chat">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="ai-icon">🤖</div>
              <h1>What can I help with?</h1>
              <p>Talk with ChatABi using text, files or voice.</p>
            </div>
          ) : (
            <div className="messages">
              {messages.map((msg, index) => (
                <div className="message-row" key={index}>
                  <div className="avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message">
                    <p>{msg.text}</p>
                    {msg.files?.length > 0 && (
                      <div className="message-files">
                        📎 {msg.files.join(', ')}
                      </div>
                    )}
                    {msg.role === 'ai' && (
                      <button onClick={() => speakReply(msg.text)}>
                        🔊 Listen
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {loading && <p className="thinking">ChatABi is thinking...</p>}
            </div>
          )}
        </section>

        <div className="composer">
          {attachments.length > 0 && (
            <div className="attachment-list">
              {attachments.map((file, index) => (
                <div className="attachment-chip" key={index}>
                  📎 {file.name}
                  <button onClick={() => removeFile(index)}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="input-area">
            <div className="plus-wrap">
              <button
                className="plus-btn"
                onClick={() => setPlusOpen(prev => !prev)}
                title="Add files and tools"
              >
                {plusOpen ? '×' : '+'}
              </button>

              {plusOpen && (
                <div className="plus-menu">
                  <button onClick={() => cameraRef.current.click()}>
                    📷 Camera
                  </button>
                  <button onClick={() => photoRef.current.click()}>
                    🖼️ Photos
                  </button>
                  <button onClick={() => fileRef.current.click()}>
                    📁 Files
                  </button>
                  <button onClick={() => {
                    setPlusOpen(false)
                    alert('Plugins will be available after plugin connections are added.')
                  }}>
                    🔌 Plugins
                  </button>
                  <button onClick={() => {
                    setThinkHarder(prev => !prev)
                    setPlusOpen(false)
                  }}>
                    🧠 {thinkHarder ? '✓ Think Harder ON' : 'Think Harder'}
                  </button>
                  <button onClick={() => {
                    setWebSearch(prev => !prev)
                    setPlusOpen(false)
                  }}>
                    🌐 {webSearch ? '✓ Web Search ON' : 'Web Search'}
                  </button>
                </div>
              )}
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={addFiles}
            />
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              hidden
              multiple
              onChange={addFiles}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,text/plain"
              hidden
              multiple
              onChange={addFiles}
            />

            <button className="voice-btn" onClick={startVoiceInput}>
              {listening ? '🎙️' : '🎤'}
            </button>

            <input
              className="message-input"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Message ChatABi..."
            />

            <button className="send" onClick={sendMessage} disabled={loading}>
              ➤
            </button>
          </div>

          <div className="mode-status">
            {thinkHarder && <span>🧠 Think Harder ON</span>}
            {webSearch && <span>🌐 Web Search ON</span>}
          </div>
        </div>

        {speaking && (
          <button className="stop-voice" onClick={stopSpeaking}>
            ⏹ Stop Voice
          </button>
        )}

        <p className="footer-text">
          ChatABi can make mistakes. Check important information.
        </p>
      </main>
    </div>
  )
}

export default App

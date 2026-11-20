import express from 'express'
import { GoogleGenAI } from '@google/genai'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json({ limit: '20mb' }))

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not found!')
  process.exit(1)
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
})

const systemInstruction = `
You are ChatABi, an intelligent multilingual AI assistant.

LANGUAGE RULES:
- Detect the language used by the user.
- Reply in the same language as the latest message.
- Support Bengali, English, Hindi, Arabic, Urdu and other languages.

YOUR ABILITIES:
- Education, science, technology and programming
- Mathematics, history and geography
- Islam and general knowledge
- Writing, translation and daily life
- Analyze uploaded images and PDF documents

RESPONSE RULES:
- Be accurate, helpful, polite and respectful.
- Explain difficult topics simply.
- Never invent facts.
- Keep answers clear and relevant.
`

app.post('/api/chat', async (req, res) => {
  try {
    const {
      message,
      attachments = [],
      thinkHarder = false,
      webSearch = false
    } = req.body

    if ((!message || typeof message !== 'string') &&
        (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ error: 'Please enter a message or attach a file.' })
    }

    if (!Array.isArray(attachments) || attachments.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 files are allowed.' })
    }

    const parts = [{
      text: `${message || 'Please analyze the attached file.'}${
        thinkHarder
          ? '\nPlease think carefully and provide a well-checked answer.'
          : ''
      }`
    }]

    for (const file of attachments) {
      if (!file.data || !file.mimeType) continue

      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'application/pdf',
        'text/plain'
      ]

      if (!allowed.includes(file.mimeType)) {
        return res.status(400).json({
          error: `Unsupported file type: ${file.mimeType}`
        })
      }

      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      })
    }

    const config = { systemInstruction }

    if (webSearch) {
      config.tools = [{ googleSearch: {} }]
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ role: 'user', parts }],
      config
    })

    res.json({
      reply: response.text || 'No response generated.'
    })

  } catch (error) {
    console.error('AI Error:', error.message)
    res.status(500).json({
      error: 'AI is temporarily unavailable. Please try again.'
    })
  }
})

app.use(express.static(path.join(__dirname, 'dist')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ChatABi AI Server running on port ${PORT}`)
})

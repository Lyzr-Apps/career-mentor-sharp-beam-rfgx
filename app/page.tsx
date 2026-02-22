'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  RiSendPlaneFill,
  RiAddLine,
  RiSearchLine,
  RiCompassLine,
  RiMapPinLine,
  RiRoadMapLine,
  RiBookOpenLine,
  RiScalesLine,
  RiArrowRightLine,
  RiChat1Line,
  RiDeleteBinLine,
  RiUserLine,
  RiParentLine,
  RiMenuLine,
  RiCloseLine,
  RiTimeLine,
  RiLightbulbLine,
  RiRefreshLine,
} from 'react-icons/ri'

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENT_ID = '699a7731d5e86513c94d3144'
const LS_KEY = 'careerpath-conversations'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  suggestedPrompts?: string[]
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
  mode: 'student' | 'parent'
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length > max ? text.slice(0, max) + '...' : text
}

function timeAgo(dateStr: string): string {
  try {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return ''
  }
}

// ─── Markdown Renderer ─────────────────────────────────────────────────────

function formatInline(text: string): React.ReactNode {
  if (!text) return text
  // Handle bold + italic
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0

  // Process **bold** and *italic* and `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<em key={key++} className="italic">{match[3]}</em>)
    } else if (match[4]) {
      parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-xs font-mono">{match[4]}</code>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex))
  }
  return parts.length > 0 ? parts : text
}

function renderMarkdownTable(lines: string[], startIdx: number): { element: React.ReactNode; endIdx: number } {
  const tableLines: string[] = []
  let idx = startIdx
  while (idx < lines.length && lines[idx].trim().startsWith('|')) {
    tableLines.push(lines[idx].trim())
    idx++
  }

  if (tableLines.length < 2) {
    return { element: null, endIdx: startIdx }
  }

  const parseRow = (line: string): string[] => {
    return line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1).map(c => c.trim())
  }

  const headers = parseRow(tableLines[0])
  const isSeparator = (line: string) => /^\|[\s\-:|]+\|$/.test(line)
  const dataStart = isSeparator(tableLines[1]) ? 2 : 1
  const rows = tableLines.slice(dataStart).map(parseRow)

  const element = (
    <div key={`table-${startIdx}`} className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/50">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground border-b border-border">{formatInline(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-card' : 'bg-secondary/20'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground border-b border-border/50">{formatInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return { element, endIdx: idx }
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeKey = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`} className="my-3 p-4 rounded-lg bg-foreground/5 border border-border overflow-x-auto">
            <code className="text-sm font-mono text-foreground/90">{codeLines.join('\n')}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      i++
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      i++
      continue
    }

    // Table detection
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const { element, endIdx } = renderMarkdownTable(lines, i)
      if (element) {
        elements.push(element)
        i = endIdx
        continue
      }
    }

    // Headings
    if (line.startsWith('#### ')) {
      elements.push(<h5 key={i} className="font-semibold text-sm mt-3 mb-1 text-foreground">{formatInline(line.slice(5))}</h5>)
      i++; continue
    }
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-semibold text-sm mt-3 mb-1 text-foreground">{formatInline(line.slice(4))}</h4>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-semibold text-base mt-4 mb-1 text-foreground">{formatInline(line.slice(3))}</h3>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-lg mt-4 mb-2 text-foreground">{formatInline(line.slice(2))}</h2>)
      i++; continue
    }

    // Bullet lists
    if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('* ')) {
      const indent = line.length - line.trimStart().length
      const content = line.trimStart().slice(2)
      elements.push(
        <li key={i} className="list-disc text-sm leading-relaxed" style={{ marginLeft: `${Math.max(16, indent * 8 + 16)}px` }}>
          {formatInline(content)}
        </li>
      )
      i++; continue
    }

    // Numbered lists
    if (/^\s*\d+\.\s/.test(line)) {
      const content = line.replace(/^\s*\d+\.\s/, '')
      elements.push(
        <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">
          {formatInline(content)}
        </li>
      )
      i++; continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-3 border-border" />)
      i++; continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />)
      i++; continue
    }

    // Regular paragraph
    elements.push(<p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>)
    i++
  }

  return <div className="space-y-1">{elements}</div>
}

// ─── Error Boundary ─────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Conversation Storage ───────────────────────────────────────────────────

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(convos))
  } catch {
    // quota exceeded — silently fail
  }
}

// ─── Sample Data ────────────────────────────────────────────────────────────

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: 'sample-1',
    title: 'Which stream should I choose after 10th?',
    mode: 'student',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    messages: [
      {
        id: 's1-m1',
        role: 'user',
        content: 'Which stream should I choose after 10th?',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 's1-m2',
        role: 'assistant',
        content:
          '## Choosing the Right Stream After 10th\n\nGreat question! The three main streams after 10th are:\n\n### 1. Science (PCM / PCB)\n- **Best for:** Engineering, Medicine, Research, Technology\n- **Key subjects:** Physics, Chemistry, Mathematics/Biology\n- **Career paths:** Doctor, Engineer, Data Scientist, Architect\n\n### 2. Commerce\n- **Best for:** Business, Finance, Banking\n- **Key subjects:** Accountancy, Business Studies, Economics\n- **Career paths:** CA, MBA, Investment Banking, Entrepreneurship\n\n### 3. Arts / Humanities\n- **Best for:** Law, Civil Services, Media, Design\n- **Key subjects:** History, Political Science, Psychology, Sociology\n- **Career paths:** Lawyer, IAS Officer, Journalist, Psychologist\n\n**Tip:** Consider your interests, aptitude, and long-term career goals. Talk to counselors and explore career assessments.',
        timestamp: new Date(Date.now() - 3595000).toISOString(),
        suggestedPrompts: [
          'What are the top careers in Science stream?',
          'How to prepare for medical entrance exams?',
          'Is Commerce a good stream for business?',
        ],
      },
    ],
  },
  {
    id: 'sample-2',
    title: 'Career options after 12th Commerce',
    mode: 'student',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    messages: [
      {
        id: 's2-m1',
        role: 'user',
        content: 'What are the best career options after 12th Commerce?',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 's2-m2',
        role: 'assistant',
        content:
          '## Top Career Options After 12th Commerce\n\n### Professional Courses\n1. **Chartered Accountancy (CA)** - Premier finance qualification\n2. **Company Secretary (CS)** - Corporate governance expert\n3. **CMA (Cost Management Accountant)** - Cost & management focus\n\n### Degree Programs\n- **B.Com (Hons)** - Foundation for finance careers\n- **BBA** - Management & entrepreneurship\n- **B.Com + CA** - Dual qualification advantage\n- **Economics (Hons)** - Policy, research, banking\n\n### Emerging Fields\n| Field | Avg Salary | Growth |\n|-------|-----------|--------|\n| Financial Analyst | 6-12 LPA | High |\n| Digital Marketing | 4-10 LPA | Very High |\n| Data Analytics | 5-15 LPA | Very High |\n| E-commerce | 4-8 LPA | High |',
        timestamp: new Date(Date.now() - 86395000).toISOString(),
        suggestedPrompts: [
          'How to start CA preparation?',
          'BBA vs B.Com - which is better?',
          'Scholarships for Commerce students',
        ],
      },
    ],
  },
  {
    id: 'sample-3',
    title: '[Parent] Guidance for my child choosing Science',
    mode: 'parent',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    messages: [
      {
        id: 's3-m1',
        role: 'user',
        content: '[Parent Mode] My child is interested in Science stream. How can I support them?',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
      },
      {
        id: 's3-m2',
        role: 'assistant',
        content:
          "## Supporting Your Child in the Science Stream\n\nAs a parent, here's how you can help:\n\n### 1. Understand Their Interest\n- Is it **PCM** (Physics, Chemistry, Math) or **PCB** (Physics, Chemistry, Biology)?\n- Talk to them about their dream career\n\n### 2. Academic Support\n- Help them find good coaching if needed\n- Ensure a quiet study environment\n- Encourage consistent study habits\n\n### 3. Entrance Exam Preparation\n- **JEE** for Engineering (start early in 11th)\n- **NEET** for Medical (requires dedicated biology focus)\n- **CUET** for central university admissions\n\n### 4. Beyond Academics\n- Encourage science projects and competitions\n- Visit science fairs and open days at colleges\n- Connect them with mentors in their field of interest\n\n**Remember:** Support their choice, don't impose. A motivated student always performs better.",
        timestamp: new Date(Date.now() - 172795000).toISOString(),
        suggestedPrompts: [
          'Best coaching institutes for JEE preparation',
          'How much does medical education cost?',
          'Alternative careers in Science besides Doctor/Engineer',
        ],
      },
    ],
  },
]

// ─── Quick Start Prompts ────────────────────────────────────────────────────

const QUICK_START_PROMPTS = [
  'Which stream after 10th?',
  'Careers after 12th Commerce',
  'Compare two careers',
  'Build my roadmap',
]

const QUICK_ACTIONS = [
  { label: 'Career Comparison', icon: RiScalesLine, prompt: 'Help me compare two career options side by side. Ask me which careers I want to compare.' },
  { label: 'Roadmap Builder', icon: RiRoadMapLine, prompt: 'I want to build a career roadmap. Help me create a step-by-step plan for my career goal.' },
  { label: 'Resource Finder', icon: RiBookOpenLine, prompt: 'Help me find the best resources, books, and courses for my career preparation.' },
]

const FEATURES = [
  { icon: RiCompassLine, title: 'Stream Guidance', desc: 'Expert advice on choosing Science, Commerce, or Arts after 10th and 12th.' },
  { icon: RiMapPinLine, title: 'Career Mapping', desc: 'Discover career paths aligned with your interests, skills, and goals.' },
  { icon: RiRoadMapLine, title: 'Personalized Roadmaps', desc: 'Step-by-step plans for entrance exams, skill building, and college prep.' },
  { icon: RiBookOpenLine, title: 'Resource Discovery', desc: 'Curated books, courses, scholarships, and coaching recommendations.' },
]

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({
  mode,
  onModeChange,
  onStart,
  onQuickPrompt,
}: {
  mode: 'student' | 'parent'
  onModeChange: (m: 'student' | 'parent') => void
  onStart: () => void
  onQuickPrompt: (prompt: string) => void
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Hero */}
      <div className="text-center max-w-2xl mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <RiLightbulbLine className="w-3.5 h-3.5" />
          AI-Powered Career Mentorship
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight font-sans">
          CareerPath AI
        </h1>
        <p className="text-lg text-muted-foreground mb-2">
          Your AI Career Mentor for 10th &amp; 12th Students
        </p>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Get personalized guidance on streams, careers, entrance exams, and actionable roadmaps tailored to your interests and goals.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-4 mb-8 p-2 rounded-full bg-white/60 backdrop-blur-md border border-white/30 shadow-sm">
        <button
          onClick={() => onModeChange('student')}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300',
            mode === 'student' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <RiUserLine className="w-4 h-4" />
          Student Mode
        </button>
        <button
          onClick={() => onModeChange('parent')}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300',
            mode === 'parent' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <RiParentLine className="w-4 h-4" />
          Parent Mode
        </button>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl w-full mb-10">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="p-5 rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm text-foreground mb-1">{f.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button
        size="lg"
        onClick={onStart}
        className="mb-8 px-8 py-3 text-base font-semibold rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
      >
        Start Career Guidance
        <RiArrowRightLine className="ml-2 w-5 h-5" />
      </Button>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {QUICK_START_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onQuickPrompt(p)}
            className="px-4 py-2 text-xs font-medium rounded-full bg-white/60 backdrop-blur-sm border border-white/30 text-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all duration-200"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Agent Info */}
      <div className="mt-12 p-4 rounded-xl bg-white/40 backdrop-blur-sm border border-white/20 text-center max-w-sm">
        <p className="text-xs text-muted-foreground mb-1">Powered by</p>
        <p className="text-sm font-semibold text-foreground">Career Mentor Agent</p>
        <p className="text-xs text-muted-foreground mt-1">JSON Response Agent</p>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">Online</span>
        </div>
      </div>
    </div>
  )
}

// ─── Chat Message Bubble ────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-white/75 backdrop-blur-md border border-white/30 text-foreground shadow-sm rounded-bl-md'
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          renderMarkdown(message.content)
        )}
        <div className={cn('flex items-center gap-1 mt-2', isUser ? 'justify-end' : 'justify-start')}>
          <RiTimeLine className={cn('w-3 h-3', isUser ? 'text-primary-foreground/60' : 'text-muted-foreground')} />
          <span className={cn('text-[10px]', isUser ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
            {timeAgo(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Typing Indicator ───────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-white/75 backdrop-blur-md border border-white/30 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-muted-foreground ml-1">Career Mentor is thinking...</span>
        </div>
      </div>
    </div>
  )
}

// ─── Chat Sidebar ───────────────────────────────────────────────────────────

function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  visible,
  onClose,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  visible: boolean
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className={cn(
        'fixed md:relative z-30 inset-y-0 left-0 w-72 bg-white/70 backdrop-blur-xl border-r border-white/30 flex flex-col transition-transform duration-300',
        visible ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border/50">
        <h2 className="font-semibold text-sm text-foreground">Conversations</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onNewChat} className="h-8 w-8 p-0">
            <RiAddLine className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 md:hidden">
            <RiCloseLine className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-white/50 border-border/50"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => { onSelect(c.id); onClose() }}
              className={cn(
                'group flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all duration-200',
                activeId === c.id
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-white/60 border border-transparent'
              )}
            >
              <RiChat1Line className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', activeId === c.id ? 'text-primary' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium truncate', activeId === c.id ? 'text-primary' : 'text-foreground')}>
                  {truncate(c.title, 40)}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-border/50">
                    {c.mode === 'parent' ? 'Parent' : 'Student'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(c.updatedAt)}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-opacity"
              >
                <RiDeleteBinLine className="w-3 h-3 text-destructive/70" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Empty Chat State ───────────────────────────────────────────────────────

function EmptyChatState({ onPrompt }: { onPrompt: (p: string) => void }) {
  const starters = [
    'Which stream is best for me after 10th?',
    'What are the top career options after 12th Science?',
    'Help me create a career roadmap',
    'Compare Engineering vs Medical career paths',
    'What entrance exams should I prepare for?',
    'Scholarships available for 12th students',
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <RiCompassLine className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Start a Conversation</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        Ask me anything about career guidance, stream selection, entrance exams, or educational planning.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
        {starters.map((s) => (
          <button
            key={s}
            onClick={() => onPrompt(s)}
            className="text-left p-3 rounded-xl bg-white/50 backdrop-blur-sm border border-white/30 text-xs text-foreground hover:bg-primary/5 hover:border-primary/20 transition-all duration-200"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Page() {
  // ─── State ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<'welcome' | 'chat'>('welcome')
  const [mode, setMode] = useState<'student' | 'parent'>('student')
  const [sessionId] = useState(() => generateId())
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])
  const [sampleData, setSampleData] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ─── Load conversations from localStorage ────────────────────────────
  useEffect(() => {
    setConversations(loadConversations())
  }, [])

  // ─── Save conversations when they change ──────────────────────────────
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations)
    }
  }, [conversations])

  // ─── Auto-scroll ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations, activeConversationId, loading])

  // ─── Get active conversation ──────────────────────────────────────────
  const displayConversations = sampleData
    ? [...SAMPLE_CONVERSATIONS, ...conversations]
    : conversations

  const activeConversation = displayConversations.find((c) => c.id === activeConversationId) ?? null

  const activeMessages: Message[] = activeConversation?.messages ?? []

  // ─── Send message ─────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return
      setErrorMessage(null)

      const messageText = mode === 'parent' ? `[Parent Mode] ${trimmed}` : trimmed
      const now = new Date().toISOString()
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: now,
      }

      let convoId = activeConversationId

      if (!convoId || !conversations.find((c) => c.id === convoId)) {
        // Create new conversation
        const newConvo: Conversation = {
          id: generateId(),
          title: truncate(trimmed, 60),
          messages: [userMsg],
          createdAt: now,
          updatedAt: now,
          mode,
        }
        convoId = newConvo.id
        setConversations((prev) => [newConvo, ...prev])
        setActiveConversationId(convoId)
      } else {
        // Add to existing conversation
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convoId ? { ...c, messages: [...c.messages, userMsg], updatedAt: now } : c
          )
        )
      }

      setInputValue('')
      setSuggestedPrompts([])
      setLoading(true)
      setActiveAgentId(AGENT_ID)

      try {
        const result = await callAIAgent(messageText, AGENT_ID, { session_id: sessionId })

        if (result.success) {
          const agentResult = result?.response?.result
          const mentorMessage =
            agentResult?.message ??
            result?.response?.message ??
            (typeof agentResult === 'string' ? agentResult : '') ??
            ''
          const prompts = Array.isArray(agentResult?.suggested_prompts)
            ? agentResult.suggested_prompts
            : []

          const assistantMsg: Message = {
            id: generateId(),
            role: 'assistant',
            content: mentorMessage || 'I received your question. Let me think about the best guidance for you.',
            timestamp: new Date().toISOString(),
            suggestedPrompts: prompts,
          }

          const finalConvoId = convoId
          setConversations((prev) =>
            prev.map((c) =>
              c.id === finalConvoId
                ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: new Date().toISOString() }
                : c
            )
          )
          setSuggestedPrompts(prompts)
        } else {
          setErrorMessage(result?.error ?? 'Unable to get guidance right now. Please try again.')
        }
      } catch {
        setErrorMessage('Unable to get guidance right now. Please try again.')
      } finally {
        setLoading(false)
        setActiveAgentId(null)
      }
    },
    [activeConversationId, conversations, loading, mode, sessionId]
  )

  // ─── Handlers ─────────────────────────────────────────────────────────
  const handleNewChat = () => {
    setActiveConversationId(null)
    setSuggestedPrompts([])
    setInputValue('')
    setErrorMessage(null)
  }

  const handleDeleteConvo = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConversationId === id) {
      setActiveConversationId(null)
      setSuggestedPrompts([])
    }
  }

  const handleSelectConvo = (id: string) => {
    setActiveConversationId(id)
    setErrorMessage(null)
    const convo = displayConversations.find((c) => c.id === id)
    if (convo) {
      const lastAssistant = [...convo.messages].reverse().find((m) => m.role === 'assistant')
      setSuggestedPrompts(
        Array.isArray(lastAssistant?.suggestedPrompts) ? lastAssistant.suggestedPrompts : []
      )
    }
  }

  const handleQuickPrompt = (prompt: string) => {
    setView('chat')
    handleNewChat()
    setTimeout(() => sendMessage(prompt), 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const handleRetry = () => {
    setErrorMessage(null)
    if (activeMessages.length > 0) {
      const lastUserMsg = [...activeMessages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        sendMessage(lastUserMsg.content)
      }
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div
        className="min-h-screen text-foreground font-sans"
        style={{
          background: 'linear-gradient(135deg, hsl(160 40% 94%) 0%, hsl(180 35% 93%) 30%, hsl(160 35% 95%) 60%, hsl(140 40% 94%) 100%)',
        }}
      >
        {view === 'welcome' ? (
          <>
            {/* Sample data toggle */}
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/30 shadow-sm">
              <span className="text-xs text-muted-foreground">Sample Data</span>
              <Switch checked={sampleData} onCheckedChange={setSampleData} />
            </div>
            <WelcomeScreen
              mode={mode}
              onModeChange={setMode}
              onStart={() => setView('chat')}
              onQuickPrompt={handleQuickPrompt}
            />
          </>
        ) : (
          <div className="h-screen flex">
            {/* Mobile overlay */}
            {sidebarVisible && (
              <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden"
                onClick={() => setSidebarVisible(false)}
              />
            )}

            {/* Sidebar */}
            <ChatSidebar
              conversations={displayConversations}
              activeId={activeConversationId}
              onSelect={handleSelectConvo}
              onNewChat={handleNewChat}
              onDelete={handleDeleteConvo}
              visible={sidebarVisible}
              onClose={() => setSidebarVisible(false)}
            />

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Chat Header */}
              <div className="h-14 px-4 flex items-center justify-between border-b border-border/30 bg-white/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarVisible(true)}
                    className="h-8 w-8 p-0 md:hidden"
                  >
                    <RiMenuLine className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <RiCompassLine className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-sm font-semibold text-foreground leading-none">CareerPath AI</h1>
                      <div className="flex items-center gap-1 mt-0.5">
                        {activeAgentId ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[10px] text-amber-600 font-medium">Processing...</span>
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-[10px] text-primary font-medium">Ready</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Mode Toggle */}
                  <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-full bg-white/60 border border-border/50">
                    <button
                      onClick={() => setMode('student')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                        mode === 'student' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <RiUserLine className="w-3 h-3" />
                      Student
                    </button>
                    <button
                      onClick={() => setMode('parent')}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all',
                        mode === 'parent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <RiParentLine className="w-3 h-3" />
                      Parent
                    </button>
                  </div>

                  {/* Sample Data toggle */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">Sample</span>
                    <Switch checked={sampleData} onCheckedChange={setSampleData} className="scale-75" />
                  </div>

                  {/* Back to Welcome */}
                  <Button variant="ghost" size="sm" onClick={() => setView('welcome')} className="h-8 text-xs">
                    <RiCloseLine className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto">
                {!activeConversation && !loading ? (
                  <EmptyChatState onPrompt={(p) => sendMessage(p)} />
                ) : (
                  <div className="max-w-3xl mx-auto px-4 py-6">
                    {activeMessages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}

                    {loading && <TypingIndicator />}

                    {errorMessage && (
                      <div className="flex justify-start mb-4">
                        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
                          <p className="text-sm text-destructive mb-2">{errorMessage}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRetry}
                            className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <RiRefreshLine className="w-3 h-3 mr-1" />
                            Try again
                          </Button>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="px-4 pb-1 max-w-3xl mx-auto w-full">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => sendMessage(qa.prompt)}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/30 text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                    >
                      <qa.icon className="w-3 h-3" />
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggestion Chips */}
              {suggestedPrompts.length > 0 && (
                <div className="px-4 pb-1 max-w-3xl mx-auto w-full">
                  <div className="flex items-center gap-1.5 mb-1">
                    <RiLightbulbLine className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Suggested follow-ups</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {suggestedPrompts.map((sp, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(sp)}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-full bg-primary/5 border border-primary/15 text-[11px] font-medium text-primary hover:bg-primary/10 transition-all duration-200 whitespace-nowrap disabled:opacity-50"
                      >
                        {sp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Bar */}
              <div className="p-4 max-w-3xl mx-auto w-full">
                <div className="relative flex items-end gap-2 p-2 rounded-2xl bg-white/70 backdrop-blur-md border border-white/40 shadow-lg shadow-primary/5">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      mode === 'parent'
                        ? 'Ask about your child\'s career options, streams, exams...'
                        : 'Ask about streams, careers, exams, roadmaps...'
                    }
                    rows={1}
                    className="flex-1 resize-none bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground py-2 px-2 max-h-32 scrollbar-none"
                    style={{ minHeight: '36px' }}
                    disabled={loading}
                  />
                  <Button
                    onClick={() => sendMessage(inputValue)}
                    disabled={!inputValue.trim() || loading}
                    size="sm"
                    className="h-9 w-9 p-0 rounded-xl flex-shrink-0"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <RiSendPlaneFill className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>

              {/* Agent Info Footer */}
              <div className="px-4 pb-3 max-w-3xl mx-auto w-full">
                <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className={cn('w-1.5 h-1.5 rounded-full', activeAgentId ? 'bg-amber-500 animate-pulse' : 'bg-primary')} />
                    Career Mentor Agent
                  </span>
                  <Separator orientation="vertical" className="h-3" />
                  <span>{mode === 'parent' ? 'Parent Mode' : 'Student Mode'}</span>
                  <Separator orientation="vertical" className="h-3" />
                  <span>JSON Response</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

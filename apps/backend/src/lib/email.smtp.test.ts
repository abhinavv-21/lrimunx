import { createServer, type Server, type Socket } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PORT = 2526

interface Received {
  from: string
  to: string[]
  data: string
}

const received: Received[] = []
let server: Server

function startSink(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((socket: Socket) => {
      let buffer = ''
      let inData = false
      let current: Received = { from: '', to: [], data: '' }
      let expectAuthPayload = false

      socket.write('220 localhost ESMTP test sink\r\n')

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')

        for (;;) {
          const cut = buffer.indexOf('\r\n')
          if (cut === -1) break
          const line = buffer.slice(0, cut)
          buffer = buffer.slice(cut + 2)

          if (inData) {
            if (line === '.') {
              inData = false
              received.push(current)
              current = { from: '', to: [], data: '' }
              socket.write('250 2.0.0 Queued\r\n')
            } else {
              current.data += (line.startsWith('..') ? line.slice(1) : line) + '\n'
            }
            continue
          }

          if (expectAuthPayload) {
            expectAuthPayload = false
            socket.write('235 2.7.0 Accepted\r\n')
            continue
          }

          const upper = line.toUpperCase()
          if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
            socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n')
          } else if (upper.startsWith('AUTH LOGIN')) {
            expectAuthPayload = true
            socket.write('334 VXNlcm5hbWU6\r\n')
          } else if (upper.startsWith('AUTH')) {
            socket.write('235 2.7.0 Accepted\r\n')
          } else if (upper.startsWith('MAIL FROM')) {
            current.from = line.slice(line.indexOf(':') + 1).trim()
            socket.write('250 2.1.0 Ok\r\n')
          } else if (upper.startsWith('RCPT TO')) {
            current.to.push(line.slice(line.indexOf(':') + 1).trim())
            socket.write('250 2.1.5 Ok\r\n')
          } else if (upper.startsWith('DATA')) {
            inData = true
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
          } else if (upper.startsWith('QUIT')) {
            socket.write('221 2.0.0 Bye\r\n')
            socket.end()
          } else {
            socket.write('250 2.0.0 Ok\r\n')
          }
        }
      })

      socket.on('error', () => {
      })
    })
    server.listen(PORT, '127.0.0.1', () => resolve())
  })
}

beforeAll(async () => {
  process.env['SMTP_HOST'] = '127.0.0.1'
  process.env['SMTP_PORT'] = String(PORT)
  process.env['SMTP_USER'] = 'sink'
  process.env['SMTP_PASSWORD'] = 'sink'
  process.env['SMTP_SECURE'] = 'false'
  process.env['SMTP_FROM'] = 'LRI MUN X <mun@example.org>'
  await startSink()
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('the confirmation over real SMTP', () => {
  it('reaches the server, addressed to the applicant and from the configured mailbox', async () => {
    const { registrationApprovedMail, sendMail } = await import('./email.js')

    const result = await sendMail(
      registrationApprovedMail({
        fullName: 'Aayush Shrestha',
        email: 'aayush.shrestha@example.org',
        reference: 'LMX-7K2Q9D',
        schoolName: "Learning Realm Int'l School",
      }),
    )

    expect(result).toEqual({ sent: true, skipped: false })
    expect(received).toHaveLength(1)

    const message = received[0]!
    expect(message.from).toBe('<mun@example.org>')
    expect(message.to).toEqual(['<aayush.shrestha@example.org>'])
  })

  it('carries both parts and the reference, as they left the composer', async () => {
    const message = received[0]!

    expect(message.data).toContain('LMX-7K2Q9D')
    expect(message.data.toLowerCase()).toContain('multipart/alternative')
    expect(message.data).toContain('text/plain')
    expect(message.data).toContain('text/html')
  })

  it('reports a failure rather than throwing when the server is gone', async () => {
    const { registrationApprovedMail, sendMail } = await import('./email.js')
    await new Promise<void>((resolve) => server.close(() => resolve()))

    const result = await sendMail(
      registrationApprovedMail({
        fullName: 'Prakriti Adhikari',
        email: 'prakriti@example.org',
        reference: 'LMX-000000',
        schoolName: 'Somewhere',
      }),
    )

    expect(result.sent).toBe(false)
    expect(result.skipped).toBe(false)
    expect(result.error).toBeTruthy()

    await startSink()
  })
})

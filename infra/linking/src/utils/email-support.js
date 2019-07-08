import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL

export default function emailSupport(from, subject, text, html) {
  if (SUPPORT_EMAIL) {
    const msg = {
      to:SUPPORT_EMAIL,
      from,
      subject,
      text,
      html
    }
    sgMail.send(msg)
  }
}

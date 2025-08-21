import express from 'express';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { messages } = req.body || { messages: [] };
    const last = Array.isArray(messages) ? [...messages].reverse().find((m) => m.role === 'user') : null;
    const q = (last?.content || '').toLowerCase();

    let reply = 'Thanks for reaching out! How can I help you with your stay?';

    if (q.includes('price') || q.includes('rate') || q.includes('cost')) {
      reply = 'Our suite rates start at ₹8,999 per night, with seasonal offers available. Would you like me to check availability for your dates?';
    } else if (q.includes('room') || q.includes('suite') || q.includes('availability')) {
      reply = 'We have Deluxe, Executive, and Presidential suites. Tell me your dates and number of guests to show availability.';
    } else if (q.includes('amenit')) {
      reply = 'Amenities include spa & wellness, infinity pool, 24/7 concierge, airport transfers, and gourmet dining.';
    } else if (q.includes('check-in') || q.includes('check in')) {
      reply = 'Check‑in starts at 2 PM and check‑out is at 12 PM. Early check‑in/late check‑out is subject to availability.';
    } else if (q.includes('location') || q.includes('where')) {
      reply = 'We’re centrally located near business and shopping districts. Parking and airport pickup are available.';
    } else if (q.includes('contact') || q.includes('phone') || q.includes('call')) {
      reply = 'You can reach our team via the Contact page. Shall I open it for you?';
    }

    return res.json({ reply });
  } catch (e) {
    return res.status(200).json({ reply: 'Sorry, something went wrong processing your request.' });
  }
});

export default router;

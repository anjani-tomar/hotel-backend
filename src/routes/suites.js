import express from 'express';

const router = express.Router();

router.get('/', (_req, res) => {
  const suites = [
    {
      title: 'Signature Suite',
      desc:
        'Experience expansive city views, bespoke furnishings, and a marble ensuite bath. Enjoy complimentary breakfast and lounge access.',
      price: 9999,
      currency: 'INR',
      image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600',
      slug: 'signature-suite',
    },
    {
      title: 'Presidential Suite',
      desc: 'A palatial residence with private lounge, butler service, and panoramic skyline views.',
      price: 19999,
      currency: 'INR',
      image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600',
      slug: 'presidential-suite',
    },
    {
      title: 'Executive Room',
      desc: 'Smart, elegant space for business travelers with ergonomic workspace and fast Wi‑Fi.',
      price: 6499,
      currency: 'INR',
      image: 'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?q=80&w=1600',
      slug: 'executive-room',
    },
    {
      title: 'Deluxe King Room',
      desc: 'A spacious retreat featuring a plush king bed, warm tones, and city vistas.',
      price: 7999,
      currency: 'INR',
      image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=1600',
      slug: 'deluxe-king-room',
    },
    {
      title: 'Family Suite',
      desc: 'Designed for families with a separate living area, twin options, and kid‑friendly amenities.',
      price: 8999,
      currency: 'INR',
      image: 'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?q=80&w=1600',
      slug: 'family-suite',
    },
  ];

  return res.json({ items: suites });
});

export default router;

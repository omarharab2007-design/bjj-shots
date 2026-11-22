/* BJJ Shots: the settings the client will change. Edit here, not in the pages. */
window.BJJ_CONFIG = {
  email: 'info@bjjshots.net',
  whatsapp: '971585477521',          // digits only, used for wa.me links
  whatsappLabel: '+971 58 547 7521',
  instagram: 'bjj__shots',
  tiktok: 'bjjshots',
  youtube: 'BJJShotss',

  // The home page numbers: the hero's reach line, the scoreboard (views + posts roll up) and the follower line under it.
  // views is text ("7M+"); posts and followers are plain numbers.
  stats: { views: '7M+', posts: 557, followers: 5782 },   // from his Instagram profile, 2026-11-22

  // Booking page: paste the payment link for competition bookings here when it exists
  // (Stripe Payment Link, Ziina, PayPal...). While it is null the page asks for a brief instead.
  bookingUrl: null,
  bookingLabel: 'Book & pay for competition coverage',

  // Photo gallery: price per photo and the checkout link. While price is null the order says "price confirmed on WhatsApp".
  // photoCheckoutUrl can be a Stripe Payment Link with adjustable quantity; the selected photo IDs are sent in the WhatsApp/email order.
  currency: 'AED',
  photoPrice: null,
  photoBundle: null,                 // e.g. { count: 5, price: 120 } shows "5 photos for AED 120"
  photoCheckoutUrl: null,
};

// Static hotel identity, used where the database is not readable yet (login screen)
// and as a fallback. Live values come from the settings row.
// Sources: hotel booking site (thepointboutiquehotel.zoombookdirect.com), Google listing, Agoda, Trip.com.
export const HOTEL = {
  name: 'The Point Boutique Hotel',
  address: '1-1-05, Jalan Titiwangsa 2, Taman Tampoi Indah, 81200 Johor Bahru, Johor, Malaysia',
  phone: '+60 7-232 6493',
  email: 'thepointhoteljb@gmail.com',
  website: 'https://thepointboutiquehotel.zoombookdirect.com/',
  starRating: 3,
}

export const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`
export const LOGO_MARK_URL = `${import.meta.env.BASE_URL}logo-mark.png`

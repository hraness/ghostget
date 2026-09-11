// @bun
// src/providers/rental-listings.ts
var RENTAL_LISTINGS_SCHEMA_VERSION = 1;
var LOCATION_MAX_LENGTH = 80;
var STREET_MAX_LENGTH = 160;
var LISTING_ID_MAX_LENGTH = 32;
var RENT_MAXIMUM = 1e5;
var BEDS_MAXIMUM = 12;
var BATHS_MAXIMUM = 20;
var SAN_JUAN_ZIP_NEIGHBORHOODS = Object.freeze({
  "00901": "Old San Juan / Puerta de Tierra / Paseo Caribe",
  "00907": "Condado/Miramar",
  "00909": "Santurce",
  "00911": "Santurce",
  "00912": "Santurce",
  "00913": "Santurce",
  "00915": "Santurce",
  "00917": "Hato Rey",
  "00918": "Hato Rey",
  "00919": "Hato Rey",
  "00920": "Puerto Nuevo",
  "00921": "R\xEDo Piedras",
  "00923": "R\xEDo Piedras",
  "00924": "R\xEDo Piedras",
  "00925": "R\xEDo Piedras",
  "00926": "R\xEDo Piedras",
  "00927": "R\xEDo Piedras"
});
var SAN_JUAN_NEIGHBORHOOD_BOXES = Object.freeze([
  Object.freeze({
    name: "Old San Juan / Puerta de Tierra / Paseo Caribe",
    minLatitude: 18.458,
    maxLatitude: 18.48,
    minLongitude: -66.125,
    maxLongitude: -66.085
  }),
  Object.freeze({
    name: "Condado/Miramar",
    minLatitude: 18.448,
    maxLatitude: 18.468,
    minLongitude: -66.09,
    maxLongitude: -66.058
  }),
  Object.freeze({
    name: "Hato Rey",
    minLatitude: 18.408,
    maxLatitude: 18.442,
    minLongitude: -66.085,
    maxLongitude: -66.045
  }),
  Object.freeze({
    name: "R\xEDo Piedras",
    minLatitude: 18.385,
    maxLatitude: 18.41,
    minLongitude: -66.065,
    maxLongitude: -66.03
  }),
  Object.freeze({
    name: "Santurce",
    minLatitude: 18.437,
    maxLatitude: 18.456,
    minLongitude: -66.085,
    maxLongitude: -66.05
  })
]);
var KNOWN_ADDRESS_NEIGHBORHOODS = Object.freeze([
  Object.freeze({
    pattern: /\baquablue\b/u,
    streetAddress: "48 Ave Luis Mu\xF1oz Rivera",
    zip: "00918",
    neighborhood: "Hato Rey"
  }),
  Object.freeze({
    pattern: /\b48\s+(?:ave(?:nida)?\.?\s+)?luis\s+mu[n\u00F1]oz\s+rivera\b/u,
    streetAddress: "48 Ave Luis Mu\xF1oz Rivera",
    zip: "00918",
    neighborhood: "Hato Rey"
  })
]);
var ZIP_PATTERN = /\b(00[0-9]{3})\b/u;
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function boundedString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}
function optionalBoundedString(value, label, maximum) {
  if (value === undefined || value === null || value === "")
    return null;
  return boundedString(value, label, maximum);
}
function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a bounded integer`);
  }
  const integer = value;
  if (integer < minimum || integer > maximum) {
    throw new Error(`${label} must be a bounded integer`);
  }
  return integer;
}
function boundedHalfStep(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a bounded half-step count`);
  }
  const scaled = value * 2;
  if (!Number.isSafeInteger(scaled) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a bounded half-step count`);
  }
  return value;
}
function exactObservedAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("rental listings observedAt must be an exact UTC observation time");
  }
  return value;
}
function foldText(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}
function puertoRicoZip(value, label = "ZIP") {
  const zip = boundedString(value, label, 5);
  if (!/^00[0-9]{3}$/u.test(zip)) {
    throw new Error(`${label} must be one Puerto Rico ZIP`);
  }
  return zip;
}
function extractPuertoRicoZip(value) {
  const match = ZIP_PATTERN.exec(value);
  return match?.[1] ?? null;
}
function parseRentalListingsSearchInput(value) {
  const input = record(value, "listings.search input");
  const keys = Object.keys(input).sort();
  for (const key of keys) {
    if (key !== "location" && key !== "beds_min" && key !== "max_price") {
      throw new Error("listings.search accepts only location, beds_min, and max_price");
    }
  }
  if (!keys.includes("location")) {
    throw new Error("listings.search requires input.location");
  }
  return Object.freeze({
    location: boundedString(input.location, "input.location", LOCATION_MAX_LENGTH),
    ...input.beds_min === undefined ? {} : {
      beds_min: boundedInteger(input.beds_min, "input.beds_min", 0, BEDS_MAXIMUM)
    },
    ...input.max_price === undefined ? {} : {
      max_price: boundedInteger(input.max_price, "input.max_price", 1, RENT_MAXIMUM)
    }
  });
}
function listingMatchesSearchFilters(listing, input) {
  if (input.beds_min !== undefined && listing.beds < input.beds_min)
    return false;
  if (input.max_price !== undefined && listing.rent > input.max_price)
    return false;
  return true;
}
function neighborhoodFromZip(zip) {
  const name = SAN_JUAN_ZIP_NEIGHBORHOODS[zip];
  if (name === undefined)
    return null;
  return Object.freeze({ name, source: "zip" });
}
function neighborhoodFromCoordinates(coordinates) {
  for (const box of SAN_JUAN_NEIGHBORHOOD_BOXES) {
    if (coordinates.latitude >= box.minLatitude && coordinates.latitude <= box.maxLatitude && coordinates.longitude >= box.minLongitude && coordinates.longitude <= box.maxLongitude) {
      return Object.freeze({ name: box.name, source: "coordinates" });
    }
  }
  return null;
}
function knownAddressMatch(value) {
  const folded = foldText(value);
  for (const known of KNOWN_ADDRESS_NEIGHBORHOODS) {
    if (known.pattern.test(folded)) {
      return Object.freeze({
        streetAddress: known.streetAddress,
        zip: known.zip,
        neighborhood: Object.freeze({
          name: known.neighborhood,
          source: "known-address"
        })
      });
    }
  }
  return null;
}
function verifyRentalNeighborhood(input) {
  const buildingText = input.buildingText ?? "";
  const streetAddress = input.streetAddress ?? null;
  const known = knownAddressMatch([streetAddress, buildingText].filter((part) => part !== null && part !== "").join(" "));
  if (known !== null) {
    return Object.freeze({
      streetAddress: streetAddress ?? known.streetAddress,
      zip: known.zip,
      neighborhood: known.neighborhood
    });
  }
  const zip = input.zip === undefined || input.zip === null ? null : puertoRicoZip(input.zip, "listing ZIP");
  if (zip !== null) {
    const fromZip = neighborhoodFromZip(zip);
    if (fromZip !== null) {
      return Object.freeze({
        streetAddress,
        zip,
        neighborhood: fromZip
      });
    }
  }
  if (input.coordinates !== undefined && input.coordinates !== null) {
    return Object.freeze({
      streetAddress,
      zip,
      neighborhood: neighborhoodFromCoordinates(input.coordinates)
    });
  }
  return Object.freeze({
    streetAddress,
    zip,
    neighborhood: null
  });
}
function rentalListingCoordinates(latitude, longitude) {
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 17.8 || latitude > 18.6 || longitude < -67.4 || longitude > -65.2) {
    throw new Error("listing coordinates must be one Puerto Rico point");
  }
  return Object.freeze({ latitude, longitude });
}
function projectRentalListing(input) {
  const id = boundedString(input.id, "listing id", LISTING_ID_MAX_LENGTH);
  if (!/^[0-9]{1,16}$/u.test(id)) {
    throw new Error("listing id must be one numeric classified identifier");
  }
  const verified = verifyRentalNeighborhood({
    streetAddress: optionalBoundedString(input.streetAddress, "listing street address", STREET_MAX_LENGTH),
    zip: input.zip ?? null,
    coordinates: input.coordinates ?? null,
    buildingText: input.buildingText ?? null
  });
  return Object.freeze({
    id,
    url: boundedString(input.url, "listing URL", 512),
    rent: boundedInteger(input.rent, "listing rent", 1, RENT_MAXIMUM),
    beds: boundedInteger(input.beds, "listing beds", 0, BEDS_MAXIMUM),
    baths: boundedHalfStep(input.baths, "listing baths", 0, BATHS_MAXIMUM),
    streetAddress: verified.streetAddress,
    zip: verified.zip,
    neighborhood: verified.neighborhood,
    coordinates: input.coordinates ?? null
  });
}
function projectRentalListingsSearch(input) {
  const listings = Object.freeze([...input.listings].sort((left, right) => left.id.localeCompare(right.id, "en")));
  const ids = new Set;
  for (const listing of listings) {
    if (ids.has(listing.id)) {
      throw new Error("rental listings search repeated one listing");
    }
    ids.add(listing.id);
  }
  return Object.freeze({
    schemaVersion: RENTAL_LISTINGS_SCHEMA_VERSION,
    provider: boundedString(input.provider, "listings provider", 40),
    target: Object.freeze({
      kind: "search",
      location: boundedString(input.location, "search location", LOCATION_MAX_LENGTH),
      url: boundedString(input.url, "search URL", 512)
    }),
    observedAt: exactObservedAt(input.observedAt),
    completeness: input.completeness,
    listings
  });
}

// src/providers/clasificados-web.ts
var CLASIFICADOS_WEB_OPERATION_NAMES = Object.freeze([
  "listings.search"
]);
var CLASIFICADOS_WEB_OPERATIONS = Object.freeze({
  "listings.search": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    reason: "fixed credential-free rental-list GET binds reviewed pueblo values, projects each comment-marked card from schema.org and list-row hidden coordinates, then verifies neighborhood from street, ZIP, known address, or those coordinates"
  })
});
var CLASIFICADOS_ORIGIN = "https://www.clasificadosonline.com";
var CLASIFICADOS_LIST_PATH = "/UDRentalsListingAdv.asp";
var CLASIFICADOS_DETAIL_PATH = "/UDRentalsDetail.asp";
var CLASIFICADOS_PAGE_SIZE = 15;
var CLASIFICADOS_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
var CLASIFICADOS_SAN_JUAN_PUEBLOS = Object.freeze([
  "San Juan - Condado-Miramar",
  "San Juan - Hato Rey",
  "San Juan - R\xEDo Piedras",
  "San Juan - Santurce",
  "San Juan - Viejo SJ"
]);
var CLASIFICADOS_LISTINGS_SEARCH_INPUT = Object.freeze({
  properties: Object.freeze({
    location: Object.freeze({
      type: "string",
      description: "Exact rental search locality",
      minLength: 1,
      maxLength: 80
    }),
    beds_min: Object.freeze({
      type: "number",
      description: "Minimum bedroom count",
      minimum: 0,
      maximum: 12
    }),
    max_price: Object.freeze({
      type: "number",
      description: "Maximum monthly rent in USD",
      minimum: 1,
      maximum: 1e5
    })
  }),
  required: Object.freeze(["location"])
});
var CLASIFICADOS_LISTINGS_SEARCH_CONTRACT = Object.freeze({
  site: "clasificados",
  operation: "listings.search",
  contractVersion: 1,
  risk: "R1",
  input: CLASIFICADOS_LISTINGS_SEARCH_INPUT,
  sideEffect: "none",
  idempotency: "none",
  dedupeWindowMs: 0,
  state: "observed",
  dispatch: "none",
  implementation: CLASIFICADOS_WEB_OPERATIONS["listings.search"].reason
});
var STREET_PATTERN = /\b(?:calle|ave(?:nida)?\.?|av\.?)\s+[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00F10-9.']+(?:\s+[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00F10-9.']+){0,5}(?:\s+\d{1,5})?/iu;
var NUMBERED_STREET_PATTERN = /\b\d{1,5}\s+(?:calle|ave(?:nida)?\.?|av\.?|luis\s+mu[n\u00F1]oz\s+rivera)(?:\s+[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00F10-9.']+){0,4}/iu;
function foldLocation(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}
function clasificadosPueblosForLocation(location) {
  const folded = foldLocation(location);
  if (folded === "san juan" || folded === "san juan pr" || folded === "san juan puerto rico") {
    return CLASIFICADOS_SAN_JUAN_PUEBLOS;
  }
  if (folded === "hato rey" || folded === "san juan hato rey") {
    return Object.freeze(["San Juan - Hato Rey"]);
  }
  if (folded === "condado" || folded === "miramar" || folded === "condado miramar" || folded === "san juan condado miramar") {
    return Object.freeze(["San Juan - Condado-Miramar"]);
  }
  if (folded === "santurce" || folded === "san juan santurce") {
    return Object.freeze(["San Juan - Santurce"]);
  }
  if (folded === "rio piedras" || folded === "san juan rio piedras") {
    return Object.freeze(["San Juan - R\xEDo Piedras"]);
  }
  if (folded === "viejo san juan" || folded === "old san juan" || folded === "osj" || folded === "san juan viejo sj") {
    return Object.freeze(["San Juan - Viejo SJ"]);
  }
  throw new Error("listings.search location is not one reviewed Puerto Rico rental locality");
}
function encodeLatin1QueryComponent(value) {
  let encoded = "";
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined || code > 255) {
      throw new Error("Clasificados query value is outside the reviewed latin-1 set");
    }
    if (code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || character === "-" || character === "." || character === "_") {
      encoded += character;
      continue;
    }
    if (character === " ") {
      encoded += "+";
      continue;
    }
    encoded += `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}
function clasificadosFormQuery(fields) {
  return Object.entries(fields).map(([key, value]) => `${key}=${encodeLatin1QueryComponent(value)}`).join("&");
}
function clasificadosListUrl(pueblo, input, offset = 0) {
  const query = clasificadosFormQuery({
    RentalsPueblos: pueblo,
    Category: "Apartamento",
    ...input.max_price === undefined ? {} : { HighPrice: String(input.max_price) },
    ...offset > 0 ? { offset: String(offset) } : {}
  });
  return new URL(`${CLASIFICADOS_LIST_PATH}?${query}`, CLASIFICADOS_ORIGIN);
}
function clasificadosSearchTargetUrl(location, input) {
  const pueblos = clasificadosPueblosForLocation(location);
  if (pueblos.length === 1 && pueblos[0] !== undefined) {
    return clasificadosListUrl(pueblos[0], input).href;
  }
  return clasificadosListUrl("San Juan - Hato Rey", input).href;
}
function clasificadosDetailUrl(id) {
  if (!/^[0-9]{1,16}$/u.test(id)) {
    throw new Error("Clasificados listing id must be one numeric classified identifier");
  }
  const url = new URL(CLASIFICADOS_DETAIL_PATH, CLASIFICADOS_ORIGIN);
  url.searchParams.set("ReForRentAdID", id);
  return url.href;
}
function decodeHtmlEntities(value) {
  return value.replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;/giu, "'").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&iacute;/giu, "\xED").replace(/&oacute;/giu, "\xF3").replace(/&aacute;/giu, "\xE1").replace(/&eacute;/giu, "\xE9").replace(/&uacute;/giu, "\xFA").replace(/&ntilde;/giu, "\xF1").replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)));
}
function collapseWhitespace(value) {
  return decodeHtmlEntities(value).replace(/\s+/gu, " ").trim();
}
function metaContent(html, itemprop) {
  const pattern = new RegExp(`itemprop="${itemprop}"\\s+content="([^"]*)"`, "iu");
  const match = pattern.exec(html);
  if (match?.[1] === undefined)
    return null;
  const value = collapseWhitespace(match[1]);
  return value.length > 0 ? value : null;
}
function hiddenClassValue(html, className) {
  const pattern = new RegExp(`<input\\s+type="hidden"\\s+class="${className}"\\s+value="([^"]*)"`, "iu");
  const match = pattern.exec(html);
  if (match?.[1] === undefined)
    return null;
  const value = collapseWhitespace(match[1]);
  return value.length > 0 ? value : null;
}
function afterIcon(html, iconFile) {
  const index = html.indexOf(iconFile);
  if (index < 0)
    return null;
  const tagEnd = html.indexOf(">", index);
  if (tagEnd < 0)
    return null;
  const match = /^\s*([^<\r\n]+)/u.exec(html.slice(tagEnd + 1));
  if (match?.[1] === undefined)
    return null;
  const value = collapseWhitespace(match[1]);
  return value.length > 0 ? value : null;
}
function parseCount(value, label) {
  if (/^(?:estudio|efficiency|studio)$/iu.test(value))
    return 0;
  const half = /^([0-9]{1,2})\s+1\/2$/u.exec(value);
  if (half?.[1] !== undefined)
    return Number(half[1]) + 0.5;
  const match = /^([0-9]{1,2})(?:\.(5|0|00))?$/u.exec(value);
  if (match?.[1] === undefined) {
    throw new Error(`${label} was not a reviewed room count`);
  }
  return match[2] === "5" ? Number(match[1]) + 0.5 : Number(match[1]);
}
function parseBeds(value) {
  const beds = parseCount(value, "Clasificados beds");
  if (!Number.isSafeInteger(beds)) {
    throw new Error("Clasificados beds was not a reviewed room count");
  }
  return beds;
}
function inferStudioBeds(title, description) {
  const text = [title, description].filter((part) => part !== null).join(" ");
  return /(?:estudio|efficiency|studio)/iu.test(text) ? 0 : null;
}
function puebloFromCard(html) {
  const match = /RentalsPueblos=([^"]+)"/u.exec(html);
  if (match?.[1] === undefined)
    return null;
  const pueblo = collapseWhitespace(decodeURIComponent(match[1].replace(/\+/gu, " ")));
  return pueblo.length > 0 ? pueblo : null;
}
function listingIdFromCard(html, detailUrl) {
  const fromUrl = /ReForRentAdID=([0-9]{1,16})/u.exec(detailUrl ?? "");
  if (fromUrl?.[1] !== undefined)
    return fromUrl[1];
  const fromHref = /UDRentalsDetail\.asp\?ReForRentAdID=([0-9]{1,16})/u.exec(html);
  if (fromHref?.[1] === undefined) {
    throw new Error("Clasificados card did not bind one listing identifier");
  }
  return fromHref[1];
}
function exactDetailUrl(id, raw) {
  const expected = clasificadosDetailUrl(id);
  if (raw === null)
    return expected;
  let url;
  try {
    url = new URL(raw, CLASIFICADOS_ORIGIN);
  } catch {
    throw new Error("Clasificados card detail URL was invalid");
  }
  if (url.origin !== CLASIFICADOS_ORIGIN || url.pathname !== CLASIFICADOS_DETAIL_PATH || url.searchParams.get("ReForRentAdID") !== id || [...url.searchParams.keys()].join(",") !== "ReForRentAdID" || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error("Clasificados card detail URL drifted");
  }
  return expected;
}
function extractStreetAddress(title, description) {
  for (const text of [title, description]) {
    if (text === null)
      continue;
    const numbered = NUMBERED_STREET_PATTERN.exec(text);
    if (numbered?.[0] !== undefined)
      return collapseWhitespace(numbered[0]);
    const named = STREET_PATTERN.exec(text);
    if (named?.[0] !== undefined)
      return collapseWhitespace(named[0]);
  }
  return null;
}
function cardChunks(html) {
  const starts = [
    ...html.matchAll(/<!--\s*Start:\s*Classified row\s*-->/gu)
  ].map((match) => match.index);
  const chunks = [];
  for (let index = 0;index < starts.length; index += 1) {
    const start = starts[index];
    const next = starts[index + 1] ?? html.length;
    if (start === undefined)
      continue;
    chunks.push(html.slice(start, next));
  }
  return Object.freeze(chunks);
}
function projectClasificadosListingCard(html, expectedPueblo) {
  const title = metaContent(html, "name");
  const priceText = hiddenClassValue(html, "Price") ?? metaContent(html, "price");
  const description = metaContent(html, "description");
  const bedsText = afterIcon(html, "icon_cuartos.png") ?? (inferStudioBeds(title, description) === 0 ? "Efficiency" : null);
  const bathsText = afterIcon(html, "icon_bano.png");
  const rawLat = hiddenClassValue(html, "Lat");
  const rawLon = hiddenClassValue(html, "Lon");
  const rawDetail = hiddenClassValue(html, "DetailUrl");
  const pueblo = puebloFromCard(html);
  if (title === null || priceText === null || bedsText === null || bathsText === null) {
    throw new Error("Clasificados card was missing a reviewed listing field");
  }
  if (pueblo === null) {
    throw new Error("Clasificados card did not bind one pueblo");
  }
  if (expectedPueblo !== undefined && pueblo !== expectedPueblo) {
    throw new Error("Clasificados card pueblo did not match the requested list");
  }
  if (!pueblo.startsWith("San Juan")) {
    throw new Error("Clasificados card is outside the requested San Juan locality");
  }
  const id = listingIdFromCard(html, rawDetail);
  const rent = Number(priceText.replace(/[^0-9]/gu, ""));
  let coordinates = null;
  if (rawLat !== null && rawLon !== null) {
    try {
      coordinates = rentalListingCoordinates(Number(rawLat), Number(rawLon));
    } catch {
      coordinates = null;
    }
  }
  const streetAddress = extractStreetAddress(title, description);
  const zip = extractPuertoRicoZip(`${title} ${description ?? ""}`);
  return projectRentalListing({
    id,
    url: exactDetailUrl(id, rawDetail),
    rent,
    beds: parseBeds(bedsText),
    baths: parseCount(bathsText, "Clasificados baths"),
    streetAddress,
    zip,
    coordinates,
    buildingText: [title, description].filter((part) => part !== null).join(" ")
  });
}
function skippableCardError(error) {
  if (!(error instanceof Error))
    return false;
  return error.message === "Clasificados card pueblo did not match the requested list" || error.message === "Clasificados card is outside the requested San Juan locality" || error.message === "Clasificados card was missing a reviewed listing field" || error.message === "Clasificados beds was not a reviewed room count" || error.message === "Clasificados baths was not a reviewed room count" || error.message === "Clasificados card did not bind one pueblo" || error.message === "Clasificados card did not bind one listing identifier" || error.message === "Clasificados card detail URL was invalid" || error.message === "Clasificados card detail URL drifted";
}
function projectClasificadosListPage(html, expectedPueblo, input) {
  if (!/<!--\s*Start:\s*Classified row\s*-->/u.test(html)) {
    if (/UDRentalsListingAdv\.asp/u.test(html) || /RentalsPueblos/u.test(html)) {
      return Object.freeze({
        listings: Object.freeze([]),
        pageFull: false,
        skippedCard: false
      });
    }
    throw new Error("Clasificados list page did not match the reviewed rental-list contract");
  }
  const listings = [];
  const chunks = cardChunks(html);
  let readable = 0;
  let skippedCard = false;
  for (const chunk of chunks) {
    try {
      const listing = projectClasificadosListingCard(chunk, expectedPueblo);
      readable += 1;
      if (listingMatchesSearchFilters(listing, input))
        listings.push(listing);
    } catch (error) {
      if (skippableCardError(error)) {
        skippedCard = true;
        continue;
      }
      throw error;
    }
  }
  if (chunks.length > 0 && readable === 0) {
    throw new Error("Clasificados list page did not project any reviewed listing cards");
  }
  return Object.freeze({
    listings: Object.freeze(listings),
    pageFull: chunks.length >= CLASIFICADOS_PAGE_SIZE,
    skippedCard
  });
}
function projectClasificadosListingsSearch(pages, input, observedAt) {
  const listings = [];
  const ids = new Set;
  let pageFull = false;
  let skippedCard = false;
  for (const page of pages) {
    const projected = projectClasificadosListPage(page.html, page.pueblo, input);
    pageFull = pageFull || projected.pageFull;
    skippedCard = skippedCard || projected.skippedCard;
    for (const listing of projected.listings) {
      if (ids.has(listing.id))
        continue;
      ids.add(listing.id);
      listings.push(listing);
    }
  }
  return projectRentalListingsSearch({
    provider: "clasificados",
    location: input.location,
    url: clasificadosSearchTargetUrl(input.location, input),
    observedAt,
    completeness: pageFull || skippedCard ? "partial" : "complete",
    listings
  });
}

export { parseRentalListingsSearchInput, CLASIFICADOS_WEB_OPERATIONS, CLASIFICADOS_ORIGIN, CLASIFICADOS_MAX_RESPONSE_BYTES, CLASIFICADOS_LISTINGS_SEARCH_CONTRACT, clasificadosPueblosForLocation, clasificadosListUrl, clasificadosSearchTargetUrl, projectClasificadosListingsSearch };

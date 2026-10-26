/**
 * World Time & Overlap — Google Workspace Add-on
 * Works in Google Calendar, Gmail, and Drive across Desktop (Chrome, Safari) & iPad/Mobile.
 */

const STORAGE_KEY_ZONES = 'USER_TIMEZONES_V2';
const STORAGE_KEY_HOME_TZ = 'USER_HOME_TZ_V1';

/**
 * Pre-loaded locations (single unified list).
 */
const DEFAULT_ZONES = [
  { id: 'ca_pt', city: 'Vancouver (PT)', tz: 'America/Vancouver' },
  { id: 'ca_mt', city: 'Calgary / Denver', tz: 'America/Edmonton' },
  { id: 'us_et', city: 'Toronto / New York', tz: 'America/Toronto' },
  { id: 'tr_ist', city: 'Istanbul', tz: 'Europe/Istanbul' },
  { id: 'ae_dxb', city: 'Dubai / Abu Dhabi', tz: 'Asia/Dubai' },
  { id: 'au_syd', city: 'Sydney / Melbourne', tz: 'Australia/Sydney' },
  { id: 'nz_akl', city: 'Auckland', tz: 'Pacific/Auckland' }
];

/**
 * Curated catalog of common IANA timezones for quick adding in Settings.
 */
const CATALOG_ZONES = [
  { label: 'US / Canada Pacific (Vancouver, LA)', city: 'Vancouver (PT)', tz: 'America/Vancouver' },
  { label: 'US / Canada Mountain (Calgary, Denver)', city: 'Calgary / Denver', tz: 'America/Edmonton' },
  { label: 'US Arizona (Phoenix - No DST)', city: 'Phoenix', tz: 'America/Phoenix' },
  { label: 'US / Canada Central (Chicago, Winnipeg)', city: 'Chicago / Winnipeg', tz: 'America/Chicago' },
  { label: 'US / Canada Eastern (Toronto, New York)', city: 'Toronto / New York', tz: 'America/Toronto' },
  { label: 'UK (London)', city: 'London', tz: 'Europe/London' },
  { label: 'Central Europe (Paris, Berlin, Amsterdam)', city: 'Paris / Berlin', tz: 'Europe/Paris' },
  { label: 'Turkey (Istanbul)', city: 'Istanbul', tz: 'Europe/Istanbul' },
  { label: 'UAE (Dubai)', city: 'Dubai', tz: 'Asia/Dubai' },
  { label: 'Saudi Arabia (Riyadh)', city: 'Riyadh', tz: 'Asia/Riyadh' },
  { label: 'India (Mumbai, Delhi)', city: 'Mumbai', tz: 'Asia/Kolkata' },
  { label: 'Singapore / Hong Kong', city: 'Singapore', tz: 'Asia/Singapore' },
  { label: 'Japan (Tokyo)', city: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'Australia West (Perth)', city: 'Perth', tz: 'Australia/Perth' },
  { label: 'Australia Central (Adelaide)', city: 'Adelaide', tz: 'Australia/Adelaide' },
  { label: 'Australia Queensland (Brisbane - No DST)', city: 'Brisbane', tz: 'Australia/Brisbane' },
  { label: 'Australia East (Sydney, Melbourne)', city: 'Sydney / Melbourne', tz: 'Australia/Sydney' },
  { label: 'New Zealand (Auckland)', city: 'Auckland', tz: 'Pacific/Auckland' }
];

// ============================================================================
// ENTRY POINTS & TRIGGERS
// ============================================================================

function onHomepage(e) {
  const userTz = getEffectiveHomeTz(e);
  const nowMs = Date.now();
  return buildMainCard(nowMs, userTz, null);
}

function onCalendarEventOpen(e) {
  const userTz = getEffectiveHomeTz(e);
  let targetMs = Date.now();
  let eventBanner = null;

  try {
    if (e && e.calendar && e.calendar.id && e.calendar.calendarId) {
      const cal = CalendarApp.getCalendarById(e.calendar.calendarId);
      if (cal) {
        const event = cal.getEventById(e.calendar.id);
        if (event) {
          const startTime = event.getStartTime();
          if (startTime) {
            targetMs = startTime.getTime();
            eventBanner = 'Synced to event: ' + (event.getTitle() || 'Untitled Event');
          }
        }
      }
    }
  } catch (err) {}

  return buildMainCard(targetMs, userTz, eventBanner);
}

// ============================================================================
// MAIN CARD BUILDER
// ============================================================================

function buildMainCard(targetMs, homeTz, bannerText) {
  const zones = getUserZones();
  const card = CardService.newCardBuilder();

  // Clean, bold header: "2:39 PM Toronto (EDT)" and "Mon, Oct 26, 2026"
  const homeTimeStr = formatTime12h(targetMs, homeTz);
  const homeDateStr = formatFullDate(targetMs, homeTz);
  const homeAbbr = getShortTzAbbr(targetMs, homeTz);
  const homeCity = formatTzCityName(homeTz);

  card.setHeader(
    CardService.newCardHeader()
      .setTitle(homeTimeStr + ' ' + homeCity + ' (' + homeAbbr + ')')
      .setSubtitle(homeDateStr)
  );

  // --------------------------------------------------------------------------
  // SECTION 1: SIMPLE TIME CONTROLS (-1h | Now | +1h  +  Date & Time Picker)
  // --------------------------------------------------------------------------
  const controlsSection = CardService.newCardSection();

  if (bannerText) {
    controlsSection.addWidget(
      CardService.newTextParagraph().setText('<b>📅 ' + sanitizeHtml(bannerText) + '</b>')
    );
  }

  // Single row of 3 buttons: -1h, Now, +1h
  const stepButtons = CardService.newButtonSet();
  const steps = [
    { label: '-1h', deltaMin: -60 },
    { label: 'Now', deltaMin: 0, isReset: true },
    { label: '+1h', deltaMin: 60 }
  ];

  steps.forEach(function(step) {
    const btn = CardService.newTextButton().setText(step.label);

    if (step.isReset) {
      btn.setOnClickAction(
        CardService.newAction()
          .setFunctionName('onResetTime')
          .setParameters({ homeTz: homeTz })
      );
    } else {
      const nextMs = targetMs + step.deltaMin * 60000;
      btn.setOnClickAction(
        CardService.newAction()
          .setFunctionName('onStepTime')
          .setParameters({
            targetMs: String(nextMs),
            homeTz: homeTz
          })
      );
    }
    stepButtons.addButton(btn);
  });
  controlsSection.addWidget(stepButtons);

  // Single Date & Time Picker
  const dateTimePicker = CardService.newDateTimePicker()
    .setFieldName('pickedDateTime')
    .setValueInMsSinceEpoch(targetMs)
    .setTimeZoneOffsetInMins(getTzOffsetMinutes(targetMs, homeTz))
    .setOnChangeAction(
      CardService.newAction()
        .setFunctionName('onDateTimePicked')
        .setParameters({ homeTz: homeTz })
    );
  controlsSection.addWidget(dateTimePicker);

  card.addSection(controlsSection);

  // --------------------------------------------------------------------------
  // SECTION 2: TIMEZONES SORTED CHRONOLOGICALLY BY OFFSET FROM LOCAL TIME
  // --------------------------------------------------------------------------
  const homeOffset = getTzOffsetMinutes(targetMs, homeTz);
  
  const sortedZones = zones.slice().sort(function(a, b) {
    const diffA = getTzOffsetMinutes(targetMs, a.tz) - homeOffset;
    const diffB = getTzOffsetMinutes(targetMs, b.tz) - homeOffset;
    return diffA - diffB;
  });

  const zonesSection = CardService.newCardSection()
    .setHeader('🌍 Timezones');

  sortedZones.forEach(function(zone) {
    zonesSection.addWidget(buildZoneWidget(zone, targetMs, homeTz));
  });

  card.addSection(zonesSection);

  // --------------------------------------------------------------------------
  // FOOTER: SETTINGS BUTTON
  // --------------------------------------------------------------------------
  const footerSection = CardService.newCardSection();
  footerSection.addWidget(
    CardService.newButtonSet().addButton(
      CardService.newTextButton()
        .setText('⚙️ Add / Edit Locations')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('onOpenSettings')
            .setParameters({ targetMs: String(targetMs), homeTz: homeTz })
        )
    )
  );
  card.addSection(footerSection);

  return card.build();
}

/**
 * Renders a single timezone row formatted exactly as:
 * Title:  * Vancouver (PT)  11:51 AM PDT *
 * Sub:    🟢 Mon, Oct 26 (-3h)
 */
function buildZoneWidget(zone, targetMs, homeTz) {
  const hour24 = getHour24(targetMs, zone.tz);
  const status = getTimeOfDayStatus(hour24);
  const formattedTime = formatTime12h(targetMs, zone.tz);
  const tzAbbr = getShortTzAbbr(targetMs, zone.tz);
  const dayShift = getDayRolloverLabel(targetMs, homeTz, zone.tz);
  const relHours = getRelativeHoursLabel(targetMs, homeTz, zone.tz);

  // Top line: Vancouver (PT) 11:51 AM PDT
  const mainLine = '<b>' + sanitizeHtml(zone.city) + '  ' + formattedTime + ' ' + tzAbbr + '</b>';
  
  // Offset label: (Local Time) or (-3h)
  const offsetLabel = (relHours === 'Local Time') ? '(Local Time)' : '(' + relHours + ')';

  // Bottom line: 🟢 Mon, Oct 26 (-3h) (+1 day • Tomorrow)
  const bottomLine = status.dot + ' ' + formatShortDate(targetMs, zone.tz) + ' ' + offsetLabel +
                     (dayShift ? ' <i>' + dayShift + '</i>' : '');

  return CardService.newDecoratedText()
    .setText(mainLine)
    .setBottomLabel(bottomLine)
    .setWrapText(true);
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

function onStepTime(e) {
  const targetMs = Number(e.parameters.targetMs || Date.now());
  const homeTz = e.parameters.homeTz || getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainCard(targetMs, homeTz, null)))
    .build();
}

function onResetTime(e) {
  const homeTz = (e && e.parameters && e.parameters.homeTz) || getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainCard(Date.now(), homeTz, null)))
    .build();
}

function onDateTimePicked(e) {
  const homeTz = (e && e.parameters && e.parameters.homeTz) || getEffectiveHomeTz(e);
  let targetMs = Date.now();
  if (e.formInput && e.formInput.pickedDateTime && e.formInput.pickedDateTime.msSinceEpoch) {
    targetMs = Number(e.formInput.pickedDateTime.msSinceEpoch);
  }
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainCard(targetMs, homeTz, null)))
    .build();
}

// ============================================================================
// SETTINGS & LOCATION MANAGEMENT CARD
// ============================================================================

function onOpenSettings(e) {
  const homeTz = (e && e.parameters && e.parameters.homeTz) || getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(buildSettingsCard(homeTz)))
    .build();
}

function buildSettingsCard(homeTz) {
  const zones = getUserZones();
  const card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('⚙️ Manage Locations')
        .setSubtitle('Add or remove timezones')
    );

  const addSection = CardService.newCardSection()
    .setHeader('➕ Add Location');

  const catalogDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Choose a City / Timezone')
    .setFieldName('catalogTz');

  CATALOG_ZONES.forEach(function(item, idx) {
    catalogDropdown.addItem(item.label, item.tz + '|' + item.city, idx === 0);
  });
  addSection.addWidget(catalogDropdown);

  addSection.addWidget(
    CardService.newTextInput()
      .setFieldName('customCity')
      .setTitle('Custom Label (Optional)')
      .setHint('e.g., Client HQ, Sydney Office')
  );

  addSection.addWidget(
    CardService.newTextInput()
      .setFieldName('customIanaTz')
      .setTitle('Or Custom IANA Timezone (Optional)')
      .setHint('e.g., America/Winnipeg, Australia/Melbourne')
  );

  addSection.addWidget(
    CardService.newTextButton()
      .setText('Add Location')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(CardService.newAction().setFunctionName('onAddZone'))
  );

  card.addSection(addSection);

  const listSection = CardService.newCardSection()
    .setHeader('📍 Saved Locations (' + zones.length + ')');

  zones.forEach(function(z) {
    listSection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel(z.tz)
        .setText('<b>' + sanitizeHtml(z.city) + '</b>')
        .setButton(
          CardService.newTextButton()
            .setText('Remove')
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName('onRemoveZone')
                .setParameters({ zoneId: z.id })
            )
        )
    );
  });

  listSection.addWidget(
    CardService.newTextButton()
      .setText('↺ Restore Default Locations')
      .setOnClickAction(CardService.newAction().setFunctionName('onResetDefaults'))
  );

  card.addSection(listSection);

  return card.build();
}

function onAddZone(e) {
  const form = e.formInput || {};
  const catalogParts = (form.catalogTz || 'America/Toronto|Toronto').split('|');
  const selectedTz = (form.customIanaTz && form.customIanaTz.trim()) ? form.customIanaTz.trim() : catalogParts[0];
  const selectedCity = (form.customCity && form.customCity.trim()) ? form.customCity.trim() : (catalogParts[1] || selectedTz);

  try {
    Utilities.formatDate(new Date(), selectedTz, 'HH:mm');
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Invalid IANA Timezone: ' + selectedTz))
      .build();
  }

  const zones = getUserZones();
  zones.push({
    id: 'tz_' + Date.now(),
    city: selectedCity,
    tz: selectedTz
  });
  saveUserZones(zones);

  const homeTz = getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Added ' + selectedCity))
    .setNavigation(
      CardService.newNavigation()
        .popToRoot()
        .updateCard(buildMainCard(Date.now(), homeTz, null))
    )
    .build();
}

function onRemoveZone(e) {
  const zoneId = e.parameters.zoneId;
  const zones = getUserZones().filter(function(z) { return z.id !== zoneId; });
  saveUserZones(zones);

  const homeTz = getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Location removed'))
    .setNavigation(
      CardService.newNavigation()
        .popToRoot()
        .updateCard(buildMainCard(Date.now(), homeTz, null))
    )
    .build();
}

function onResetDefaults(e) {
  saveUserZones(DEFAULT_ZONES);
  const homeTz = getEffectiveHomeTz(e);
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Restored default timezones'))
    .setNavigation(
      CardService.newNavigation()
        .popToRoot()
        .updateCard(buildMainCard(Date.now(), homeTz, null))
    )
    .build();
}

// ============================================================================
// TIMEZONE & FORMATTING UTILITIES
// ============================================================================

function getUserZones() {
  const raw = PropertiesService.getUserProperties().getProperty(STORAGE_KEY_ZONES);
  if (!raw) return DEFAULT_ZONES;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ZONES;
  } catch (e) {
    return DEFAULT_ZONES;
  }
}

function saveUserZones(zones) {
  PropertiesService.getUserProperties().setProperty(STORAGE_KEY_ZONES, JSON.stringify(zones));
}

function getEffectiveHomeTz(e) {
  if (e && e.userTimezone && e.userTimezone.id) {
    return e.userTimezone.id;
  }
  const saved = PropertiesService.getUserProperties().getProperty(STORAGE_KEY_HOME_TZ);
  if (saved) return saved;
  return Session.getScriptTimeZone() || 'America/Toronto';
}

function getTimeOfDayStatus(hour24) {
  if (hour24 >= 9 && hour24 < 17) {
    return { dot: '🟢', badge: 'Work Hours (9a–5p)' };
  }
  if ((hour24 >= 7 && hour24 < 9) || (hour24 >= 17 && hour24 < 22)) {
    return { dot: '🟡', badge: hour24 < 9 ? 'Early Morning' : 'Evening' };
  }
  return { dot: '🌙', badge: 'Night / Sleeping' };
}

function getHour24(ms, tz) {
  const h = Number(Utilities.formatDate(new Date(ms), tz, 'H'));
  return isNaN(h) ? 0 : h;
}

function formatTime12h(ms, tz) {
  return Utilities.formatDate(new Date(ms), tz, 'h:mm a');
}

function formatShortDate(ms, tz) {
  return Utilities.formatDate(new Date(ms), tz, 'EEE, MMM d');
}

function formatFullDate(ms, tz) {
  return Utilities.formatDate(new Date(ms), tz, 'EEE, MMM d, yyyy');
}

function getShortTzAbbr(ms, tz) {
  return Utilities.formatDate(new Date(ms), tz, 'z');
}

function formatTzCityName(tz) {
  const parts = String(tz).split('/');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

function getTzOffsetMinutes(ms, tz) {
  const zStr = Utilities.formatDate(new Date(ms), tz, 'Z');
  const sign = zStr.charAt(0) === '-' ? -1 : 1;
  const hours = Number(zStr.substring(1, 3));
  const mins = Number(zStr.substring(3, 5));
  return sign * (hours * 60 + mins);
}

function getRelativeHoursLabel(ms, homeTz, targetTz) {
  const homeOffset = getTzOffsetMinutes(ms, homeTz);
  const targetOffset = getTzOffsetMinutes(ms, targetTz);
  const diffHours = (targetOffset - homeOffset) / 60;
  if (diffHours === 0) return 'Local Time';
  const sign = diffHours > 0 ? '+' : '';
  return sign + diffHours + 'h';
}

function getDayRolloverLabel(ms, homeTz, targetTz) {
  const homeYmd = Number(Utilities.formatDate(new Date(ms), homeTz, 'yyyyMMdd'));
  const targetYmd = Number(Utilities.formatDate(new Date(ms), targetTz, 'yyyyMMdd'));
  if (targetYmd > homeYmd) return '(+1 day • Tomorrow)';
  if (targetYmd < homeYmd) return '(-1 day • Yesterday)';
  return '';
}

function formatRelativeShift(diffMinutes) {
  const sign = diffMinutes > 0 ? '+' : '-';
  const absMin = Math.abs(diffMinutes);
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  if (h > 0 && m > 0) return sign + h + 'h ' + m + 'm';
  if (h > 0) return sign + h + 'h';
  return sign + m + 'm';
}

function sanitizeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

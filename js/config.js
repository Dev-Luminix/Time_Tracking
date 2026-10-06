// App configuration. Edit these values before deploying.
window.APP_CONFIG = {
  // monday.com API token.
  // ⚠ Anything put here is PUBLIC once deployed to GitHub Pages.
  // Leave empty to have each user paste their own token on first visit
  // (stored in their browser's localStorage only).
  MONDAY_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY4ODY2NjcyMSwiYWFpIjoxMSwidWlkIjoxMDcyOTUzOTMsImlhZCI6IjIwMjYtMDctMzFUMTk6NDM6MDcuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjMzNTIyNDIwLCJyZ24iOiJldWMxIn0.vS3yLvakoJWZFHXtv4mAhvQF0CxGUU1HBL56KsctZts',

  // Board IDs (the number in the board URL: https://xxx.monday.com/boards/<ID>)
  TIME_TRACKING_BOARD_ID: '5105492108',
  PROJECTS_BOARD_ID: '5100801041',

  // Optional explicit column IDs on the Time Tracking board.
  // Leave empty to auto-detect by column type/title.
  COLUMNS: {
    date: '',     // Date column
    hours: '',    // Numbers column
    notes: '',    // Long text / Text column
    projects: '', // Connect boards column -> Projects board
    product: 'board_relation_mm7wpr3y', // Connect boards column -> Products (line-items) board
    task: 'text_mm7w2wh1',              // Text column for "what did you work on" (the item name is "Project - Product")
    person: '',   // People column
    reporter: 'text_mm7w31r9', // Text column for the reporter's name (needed for people who aren't monday users);
                  // auto-detected only by title ("Reporter" / "מדווח"). If missing, the name goes into Notes.
    status: '',   // Status column
  },

  // Optional explicit status column ID on the Projects board (auto-detected if empty).
  PROJECTS_STATUS_COLUMN: '',

  // Connect boards column on the Projects board listing each project's products.
  PROJECTS_PRODUCTS_COLUMN: 'board_relation_mm5he9fy',

  // Status label set on every new time entry.
  STATUS_LABEL: 'Done',

  // Number of projects loaded per page in the picker.
  PAGE_SIZE: 25,
};

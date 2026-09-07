const fs = require('fs');
let code = fs.readFileSync('src/pages/SpreadsheetPage.tsx', 'utf8');

code = code.replace(
`    setIsAppending(true);
    setError(null);

    try {
      await withGoogleToken(async (token) => {
        await appendAppointmentToSheet(
          token,
          config.spreadsheetId,
          selectedTab,
          newRowData,
          'New'
        );
      });
      setSuccessMsg(\`Logged row for \${newRowData.clientName} in "\${selectedTab}" tab!\`);`,
`    setIsAppending(true);
    setError(null);

    const formattedData = {
      ...newRowData,
      clientName: formatName(newRowData.clientName),
      clientPhone: formatPhoneNumber(newRowData.clientPhone)
    };

    try {
      await withGoogleToken(async (token) => {
        await appendAppointmentToSheet(
          token,
          config.spreadsheetId,
          selectedTab,
          formattedData,
          'New'
        );
      });
      setSuccessMsg(\`Logged row for \${formattedData.clientName} in "\${selectedTab}" tab!\`);`
);

fs.writeFileSync('src/pages/SpreadsheetPage.tsx', code);

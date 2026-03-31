*** Settings ***
Documentation     Excel automation example
Library           RPAForge.Excel
Library           BuiltIn

*** Variables ***
${EXCEL_FILE}     examples/excel-automation/data.xlsx

*** Tasks ***
Process Excel File
    [Documentation]    Read and process Excel data
    
    # Open workbook
    Open Workbook    ${EXCEL_FILE}
    
    # Read all data
    ${data}=    Read Worksheet    Sheet1
    
    Log    Found ${data.__len__()} rows
    
    # Process each row
    FOR    ${row}    IN    @{data}
        Log    Processing: ${row}[Name] - ${row}[Value]
    END
    
    # Close workbook
    Close Workbook

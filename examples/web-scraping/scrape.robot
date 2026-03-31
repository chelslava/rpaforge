*** Settings ***
Documentation     Web scraping example
Library           RPAForge.WebUI
Library           Collections

*** Variables ***
${URL}            https://quotes.toscrape.com

*** Tasks ***
Scrape Quotes
    [Documentation]    Scrape quotes from demo website
    
    # Open browser
    Open Browser    ${URL}    browser=chromium
    
    # Scrape quotes
    ${quotes}=    Create List
    
    FOR    ${i}    IN RANGE    3
        # Get quotes on current page
        ${page_quotes}=    Get Element Text    css:.quote
        Append To List    ${quotes}    ${page_quotes}
        
        # Go to next page if available
        ${has_next}=    Run Keyword And Return Status
        ...    Click Element    css:.next a
        
        Exit For Loop If    not ${has_next}
        Wait For Page Load
    END
    
    Log    Scraped ${quotes.__len__()} pages
    
    # Take screenshot
    Take Screenshot    quotes.png
    
    # Close browser
    Close Browser

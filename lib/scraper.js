const puppeteer = require('puppeteer');
const Database = require('./database');
const logger = require('./logger');

class CostcoScraper {
  constructor() {
    this.db = new Database();
    this.browser = null;
    this.page = null;
    this.zipCode = process.env.COSTCO_ZIP_CODE || '80031';
    this.delay = parseInt(process.env.SCRAPE_DELAY_MS) || 2000;
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
    this.totalStats = { added: 0, updated: 0, errors: 0 };
  }

  async init() {
    logger.info('Initializing scraper...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set user agent to avoid detection
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    logger.info('Scraper initialized');
  }

  async setLocation() {
    logger.info(`Setting delivery location via UI to zip code: ${this.zipCode}`);
    
    try {
      // Navigate to main page first to establish session
      await this.page.goto('https://www.costcobusinessdelivery.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for page to load completely
      await new Promise(resolve => setTimeout(resolve, this.delay));
      
      // Try to set location through UI first - look for delivery location change specifically
      let locationSetThroughUI = false;
      try {
        logger.info('Looking for delivery location change elements...');
        
        // First, check if we can find a "Change" link next to the delivery ZIP code
        const changeLocationLink = await this.page.evaluate(() => {
          const bodyText = document.body.innerText;
          
          // Look for "Change" link near "Delivery ZIP Code"
          const allElements = document.querySelectorAll('*');
          
          for (const element of allElements) {
            const text = element.textContent || '';
            if (text.toLowerCase().includes('change') && 
                (text.toLowerCase().includes('zip') || text.toLowerCase().includes('location'))) {
              
              // Check if this is a clickable element
              if (element.tagName === 'A' || element.tagName === 'BUTTON' || element.onclick) {
                return {
                  text: text.trim(),
                  tagName: element.tagName,
                  href: element.href || '',
                  className: element.className || '',
                  found: true
                };
              }
            }
          }
          
          return { found: false };
        });
        
        if (changeLocationLink.found) {
          logger.info(`Found change location element: ${changeLocationLink.tagName} - "${changeLocationLink.text}"`);
          
          // Try to click the specific change location link
          try {
            // Use the specific JavaScript function we found
            await this.page.evaluate(() => {
              // Try the specific COSTCO modal function first
              if (typeof COSTCO !== 'undefined' && COSTCO.zipCodeModal && COSTCO.zipCodeModal.showSetZipcode) {
                COSTCO.zipCodeModal.showSetZipcode();
                return true;
              }
              
              // Fallback to clicking change links
              const allElements = document.querySelectorAll('*');
              for (const element of allElements) {
                const text = element.textContent || '';
                if (text.toLowerCase().includes('change') && 
                    (text.toLowerCase().includes('zip') || text.toLowerCase().includes('delivery'))) {
                  if (element.tagName === 'A' || element.tagName === 'BUTTON' || element.onclick) {
                    element.click();
                    return true;
                  }
                }
              }
              return false;
            });
            
            // Wait for modal to appear and fully load
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Look for the specific delivery ZIP input we found in testing
            logger.info('Searching for specific delivery ZIP input...');
            const specificZipInput = await this.page.$('#WC_BusinessDeliveryBrowseForm_FormInput_zipCodeFormDeliveryZipCode');
            
            // Debug: Log all inputs in the modal to see what's actually there
            const allInputsInModal = await this.page.evaluate(() => {
              const inputs = document.querySelectorAll('input');
              const results = [];
              
              inputs.forEach(input => {
                const style = window.getComputedStyle(input);
                const isVisible = input.offsetParent !== null;
                
                results.push({
                  id: input.id,
                  name: input.name,
                  type: input.type,
                  value: input.value,
                  placeholder: input.placeholder,
                  className: input.className,
                  isVisible,
                  display: style.display,
                  visibility: style.visibility
                });
              });
              
              return results;
            });
            
            logger.info(`Found ${allInputsInModal.length} inputs in modal:`, allInputsInModal.filter(input => input.isVisible || input.id.includes('zip') || input.name.includes('zip')));
            
            // Take screenshot for debugging in GitHub Actions
            if (process.env.CI) {
              await this.page.screenshot({ 
                path: 'debug-modal-after-input.png',
                fullPage: true 
              });
              logger.info('Saved debug screenshot: debug-modal-after-input.png');
            }
            
            if (specificZipInput) {
              logger.info('Found the specific delivery ZIP input in modal');
              
              // Check if it's actually visible now
              const isVisible = await specificZipInput.evaluate(el => {
                const style = window.getComputedStyle(el);
                return el.offsetParent !== null && 
                       style.display !== 'none' && 
                       style.visibility !== 'hidden';
              });
              
              logger.info(`Delivery ZIP input visibility: ${isVisible}`);
              
              if (!isVisible) {
                logger.warn('Input exists but is not visible, modal may still be loading');
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
              
              // Clear and enter the zip code
              await specificZipInput.click();
              await specificZipInput.evaluate(el => el.value = '');
              await specificZipInput.type(this.zipCode);
              
              // Verify it was entered
              const enteredValue = await specificZipInput.evaluate(el => el.value);
              logger.info(`Entered ${enteredValue} into delivery ZIP input`);
              
              if (enteredValue === this.zipCode) {
                // First try submitting with Enter key (often more reliable)
                logger.info('Attempting form submission with Enter key...');
                await specificZipInput.focus();
                await this.page.keyboard.press('Enter');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Check if Enter key submission worked
                const enterKeyResult = await this.page.evaluate((targetZip) => {
                  const bodyText = document.body.innerText;
                  const modalStillOpen = document.querySelector('.modal-dialog') !== null;
                  const currentDisplayedZip = bodyText.match(/Delivery ZIP Code:\s*(\d{5})/)?.[1] || 'not found';
                  
                  return {
                    modalStillOpen,
                    currentDisplayedZip,
                    success: currentDisplayedZip === targetZip,
                    hasTargetZip: bodyText.includes(`Delivery ZIP Code: ${targetZip}`)
                  };
                }, this.zipCode);
                
                logger.info('Enter key submission result:', enterKeyResult);
                
                if (enterKeyResult.success || enterKeyResult.hasTargetZip) {
                  logger.info(`✅ Successfully set delivery location via Enter key! ZIP is now: ${enterKeyResult.currentDisplayedZip}`);
                  locationSetThroughUI = true;
                } else {
                  logger.info('Enter key submission failed, trying button click method...');
                  
                  // Fallback to button clicking
                  const modalSubmit = await this.page.evaluate(() => {
                    // Look for buttons in the modal area, prioritizing the specific delivery ZIP button
                    const buttons = document.querySelectorAll('button, input[type="submit"]');
                    
                    // Debug: log all buttons found
                    const allButtons = Array.from(buttons).map(button => {
                      const text = button.textContent || button.value || '';
                      const style = window.getComputedStyle(button);
                      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
                      const rect = button.getBoundingClientRect();
                      return {
                        text: text.trim(),
                        value: button.value,
                        type: button.type,
                        className: button.className,
                        id: button.id,
                        isVisible,
                        inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
                        parent: button.parentElement?.className || 'no parent class'
                      };
                    });
                    console.log('All buttons found:', JSON.stringify(allButtons));
                    
                    // First, try to find the specific "Set Delivery ZIP Code" button by value attribute
                    for (const button of buttons) {
                      const text = button.textContent || button.value || '';
                      const style = window.getComputedStyle(button);
                      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
                      const rect = button.getBoundingClientRect();
                      const inViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
                      
                      // Check both text content and value attribute
                      if (isVisible && inViewport && 
                          (text.toLowerCase().includes('set delivery zip') || 
                           (button.value && button.value.toLowerCase().includes('set delivery zip')))) {
                        button.click();
                        return { clicked: true, text: text.trim() || button.value, specific: true, debugInfo: allButtons };
                      }
                    }
                    
                    // If that fails, look for input[type="submit"] with the right value
                    const submitInputs = document.querySelectorAll('input[type="submit"]');
                    for (const input of submitInputs) {
                      const value = input.value || '';
                      const style = window.getComputedStyle(input);
                      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
                      
                      if (isVisible && value.toLowerCase().includes('set delivery zip')) {
                        input.click();
                        return { clicked: true, text: value, specific: true, debugInfo: allButtons };
                      }
                    }
                    
                    return { clicked: false, debugInfo: allButtons };
                  });
                
                if (modalSubmit.clicked) {
                  logger.info(`Clicked modal submit button: "${modalSubmit.text}" (specific: ${modalSubmit.specific})`);
                } else {
                  logger.error('Failed to find submit button. Debug info:', modalSubmit.debugInfo);
                  
                  // Take screenshot for debugging
                  if (process.env.CI) {
                    await this.page.screenshot({ 
                      path: 'debug-modal-no-button.png',
                      fullPage: true 
                    });
                    logger.info('Saved debug screenshot: debug-modal-no-button.png');
                  }
                }
                  
                  // Wait a bit and check for any error messages or validation issues
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  
                  const formStatus = await this.page.evaluate(() => {
                    // Check for error messages
                    const errorElements = document.querySelectorAll('.error, .alert, .warning, [class*="error"], [class*="alert"]');
                    const errors = Array.from(errorElements).map(el => el.textContent?.trim()).filter(text => text);
                    
                    // Check if modal is still open
                    const modalOpen = document.querySelector('.modal-dialog') !== null;
                    
                    // Check current ZIP input value
                    const zipInput = document.querySelector('#WC_BusinessDeliveryBrowseForm_FormInput_zipCodeFormDeliveryZipCode');
                    const currentZipValue = zipInput ? zipInput.value : 'input not found';
                    
                    // Check for any loading indicators
                    const loadingElements = document.querySelectorAll('[class*="loading"], [class*="spinner"], .fa-spinner');
                    const isLoading = loadingElements.length > 0;
                    
                    return {
                      modalOpen,
                      currentZipValue,
                      errors,
                      isLoading,
                      url: window.location.href
                    };
                  });
                  
                  logger.info('Form status after button click:', formStatus);
                  
                  // Wait a bit more for any async processing
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  
                  // Check if location was set
                  const locationApplied = await this.page.evaluate((targetZip) => {
                    const bodyText = document.body.innerText;
                    
                    // Check for modal being closed (success indicator)
                    const modalStillOpen = document.querySelector('.modal-dialog') !== null;
                    
                    return {
                      hasDeliveryZip: bodyText.includes(`Delivery ZIP Code: ${targetZip}`),
                      hasZip: bodyText.includes(targetZip),
                      url: window.location.href,
                      modalStillOpen,
                      currentDisplayedZip: bodyText.match(/Delivery ZIP Code:\s*(\d{5})/)?.[1] || 'not found'
                    };
                  }, this.zipCode);
                  
                  logger.info('Location check after modal submission:', locationApplied);
                  
                  if (locationApplied.hasDeliveryZip || locationApplied.currentDisplayedZip === this.zipCode) {
                    logger.info(`Successfully set delivery location through modal! ZIP is now: ${locationApplied.currentDisplayedZip}`);
                    locationSetThroughUI = true;
                  } else if (!locationApplied.modalStillOpen) {
                    logger.info('Modal closed but ZIP may not have changed, checking page again...');
                    // Wait a bit more and check again
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const finalCheck = await this.page.evaluate((targetZip) => {
                      const bodyText = document.body.innerText;
                      return {
                        currentDisplayedZip: bodyText.match(/Delivery ZIP Code:\s*(\d{5})/)?.[1] || 'not found',
                        hasTargetZip: bodyText.includes(`Delivery ZIP Code: ${targetZip}`)
                      };
                    }, this.zipCode);
                    
                    logger.info('Final location check:', finalCheck);
                    if (finalCheck.hasTargetZip) {
                      logger.info('Success on final check!');
                      locationSetThroughUI = true;
                    }
                  }
                } else {
                  logger.warn('Could not find submit button in modal');
                }
                }  // End of Enter key else block
              } else {
                logger.warn(`Failed to enter zip in modal. Expected: ${this.zipCode}, Got: ${enteredValue}`);
              }
            } else {
              logger.warn('Specific delivery ZIP input not found in modal');
            }
          } catch (clickError) {
            logger.warn('Failed to click change location link:', clickError.message);
          }
        }
        
        // If change location didn't work, that's okay - cookies are working on grocery page
        if (!locationSetThroughUI) {
          logger.info('UI delivery location setting not completed, but cookies should handle location filtering');
        }
        
      } catch (uiError) {
        logger.warn('UI location setting failed:', uiError.message);
      }
      
      // If UI method didn't work, we need to fix the UI approach instead of falling back to cookies
      if (!locationSetThroughUI) {
        logger.error('UI location setting failed. The scraper requires UI-based location setting to work properly.');
        logger.error('Please check the modal interaction and ensure the delivery ZIP can be set through the UI.');
        throw new Error('UI location setting failed - scraper cannot continue without proper location filtering');
      }
      
      logger.info(`✅ Successfully set delivery location to ${this.zipCode} through UI!`);
      
    } catch (error) {
      logger.error('Error setting location through UI:', error);
      throw error; // Don't continue if UI location setting fails
    }
  }

  async getGroceryCategories() {
    logger.info('Extracting grocery categories...');
    
    try {
      // Navigate to main grocery page to get categories (ensure zip code is applied)
      await this.page.goto('https://www.costcobusinessdelivery.com/grocery', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for location to be applied
      await new Promise(resolve => setTimeout(resolve, this.delay));
      
      // Verify location is properly set by checking for zip code in page
      const locationCheck = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return {
          hasZipCode: bodyText.includes('80031') || bodyText.includes('delivery zip code: 80031'),
          url: window.location.href,
          title: document.title
        };
      });
      
      logger.info(`Location check on grocery page:`, locationCheck);
      
      // Extract grocery category links by searching for known keywords
      const categories = await this.page.evaluate(() => {
        const categories = [];
        
        // Target grocery categories - exact matches preferred
        const targetCategories = [
          "Baking", "Breads & Bakery", "Canned & Jarred Foods", "Cereal & Breakfast",
          "Dairy & Eggs", "Deli", "Fresh Produce", "Frozen Foods", 
          "Meat & Seafood", "Pantry & Dry Goods", "Soups, Broth & Chili"
        ];
        
        // Keywords to help find these categories
        const groceryKeywords = [
          'baking', 'bread', 'bakery', 'canned', 'jarred', 'cereal', 'breakfast', 
          'dairy', 'eggs', 'deli', 'produce', 'frozen', 'meat', 'seafood', 
          'pantry', 'dry goods', 'soup', 'broth', 'chili'
        ];
        
        // Search all links for grocery category matches
        const allLinks = document.querySelectorAll('a');
        
        groceryKeywords.forEach(keyword => {
          // Find links that contain this grocery keyword
          const matchingLinks = Array.from(allLinks).filter(link => {
            const href = link.href?.toLowerCase() || '';
            const text = link.textContent?.toLowerCase() || '';
            
            return (
              href.includes('costcobusinessdelivery.com') &&
              (href.includes(keyword) || text.includes(keyword)) &&
              href !== window.location.href &&
              href.includes('.html') // Ensure it's a category page, not a search
            );
          });
          
          // Process matching links
          matchingLinks.forEach(link => {
            try {
              const href = link.href;
              const linkText = link.textContent?.trim();
              
              if (!linkText || categories.find(c => c.url === href)) {
                return; // Skip duplicates
              }
              
              // Extract clean category name
              let categoryName = linkText;
              
              // Remove result counts like "(56) results"
              categoryName = categoryName.replace(/\(\d+\)\s*results?/i, '');
              // Remove just result counts like "(56)"
              categoryName = categoryName.replace(/\s*\(\d+\)\s*$/i, '');
              // Clean up extra whitespace
              categoryName = categoryName.trim();
              
              // Skip if empty, too generic, or not a real product category
              const skipCategories = [
                'all', 'home', 'search', 'filter', 'clear', 'reset', 'brand', 'category', 
                'price', 'dietary features', 'quality grade', 'warehouse only', 'what\'s new',
                'company information', 'contact us', 'credit card', 'customer service',
                'general information', 'get email offers', 'savings', 'savings events',
                'skip to main content', 'skip to results', 'united states', 'volume sales',
                'warehouse supply list', 'buying guide', 'dental hygiene', 'first aid',
                'medicines & treatments', 'gift cards', 'health & beauty'
              ];
              
              if (!categoryName || 
                  categoryName.length < 3 ||
                  skipCategories.includes(categoryName.toLowerCase()) ||
                  categoryName.toLowerCase().includes('skip') ||
                  categoryName.toLowerCase().includes('information') ||
                  categoryName.toLowerCase().includes('service') ||
                  categoryName.toLowerCase().includes('card') ||
                  href.includes('#') || // Skip anchor links
                  href.includes('collapse') || // Skip UI elements
                  href.includes('criteo.com') // Skip ads
              ) {
                return;
              }
              
              // Only include categories that match our target list
              const isTargetCategory = targetCategories.some(target => {
                const normalizedTarget = target.toLowerCase();
                const normalizedCategory = categoryName.toLowerCase();
                
                // Exact match or very close match
                return normalizedCategory === normalizedTarget ||
                       normalizedCategory.includes(normalizedTarget) ||
                       normalizedTarget.includes(normalizedCategory);
              });
              
              if (!isTargetCategory) {
                return; // Skip categories not in our target list
              }
              
              categories.push({
                name: categoryName,
                url: href,
                keyword: keyword
              });
              
            } catch (error) {
              console.error('Error processing grocery link:', error);
            }
          });
        });
        
        // Sort categories alphabetically and remove duplicates based on normalized URL
        const uniqueCategories = categories.filter((category, index, self) => {
          // Normalize URL by removing protocol and www differences
          const normalizeUrl = (url) => {
            return url.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
          };
          
          const currentNormalized = normalizeUrl(category.url);
          return index === self.findIndex(c => normalizeUrl(c.url) === currentNormalized);
        }).sort((a, b) => a.name.localeCompare(b.name));
        
        console.log(`Found ${uniqueCategories.length} grocery categories via keyword search`);
        
        return uniqueCategories;
      });
      
      logger.info(`Found ${categories.length} grocery categories:`, categories.map(c => c.name));
      return categories;
      
    } catch (error) {
      logger.error('Error extracting grocery categories:', error);
      return [];
    }
  }

  async scrapeCategory(categoryUrl, categoryName) {
    logger.info(`Scraping category: ${categoryName} (${categoryUrl})`);
    
    try {
      // Navigate to grocery page first to ensure location context
      await this.page.goto('https://www.costcobusinessdelivery.com/grocery', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to click on the category link to maintain session state
      let categoryClicked = false;
      try {
        // Look for the specific category link and extract its URL with any location parameters
        const categoryLinkInfo = await this.page.evaluate((catName) => {
          const links = Array.from(document.querySelectorAll('a'));
          const categoryLink = links.find(link => 
            link.textContent && link.textContent.toLowerCase().includes(catName.toLowerCase()) && link.href.includes('.html')
          );
          
          if (categoryLink) {
            // Get the full text to see if it includes product count
            const linkText = categoryLink.textContent.trim();
            const countMatch = linkText.match(/\((\d+)\)/);
            return {
              href: categoryLink.href,
              text: linkText,
              expectedCount: countMatch ? parseInt(countMatch[1]) : null
            };
          }
          return null;
        }, categoryName);
        
        if (categoryLinkInfo) {
          logger.info(`Found category link: ${categoryLinkInfo.href}`);
          
          // Click the link directly from the grocery page to preserve session context
          try {
            await this.page.evaluate((catName) => {
              const links = Array.from(document.querySelectorAll('a'));
              const categoryLink = links.find(link => 
                link.textContent && link.textContent.toLowerCase().includes(catName.toLowerCase()) && link.href.includes('.html')
              );
              if (categoryLink) {
                categoryLink.click();
                return true;
              }
              return false;
            }, categoryName);
            
            // Wait for navigation
            await this.page.waitForNavigation({
              waitUntil: 'networkidle2',
              timeout: 30000
            });
            
            categoryClicked = true;
            logger.info(`Successfully clicked ${categoryName} category link from grocery page`);
          } catch (clickError) {
            logger.warn(`Failed to click category link, falling back to direct navigation: ${clickError.message}`);
            
            // Fallback: Use the exact URL from the grocery page which should have location applied
            await this.page.goto(categoryLinkInfo.href, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
            categoryClicked = true;
            logger.info(`Successfully navigated to ${categoryName} category using grocery page URL`);
          }
        }
      } catch (clickError) {
        logger.warn(`Could not use grocery page category link for ${categoryName}, falling back to direct navigation:`, clickError.message);
      }
      
      // Fallback to direct navigation with location parameters if clicking didn't work
      if (!categoryClicked) {
        logger.info('Category link click failed, trying alternative approaches...');
        
        // First, try to go back to grocery page and get the proper URL with session context
        try {
          await this.page.goto('https://www.costcobusinessdelivery.com/grocery', {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Get the category link again with any session parameters
          const sessionCategoryUrl = await this.page.evaluate((catName) => {
            const links = Array.from(document.querySelectorAll('a'));
            const categoryLink = links.find(link => 
              link.textContent && link.textContent.toLowerCase().includes(catName.toLowerCase()) && link.href.includes('.html')
            );
            return categoryLink ? categoryLink.href : null;
          }, categoryName);
          
          if (sessionCategoryUrl) {
            logger.info(`Using session-aware category URL: ${sessionCategoryUrl}`);
            await this.page.goto(sessionCategoryUrl, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
          } else {
            // Last resort: try URL with location parameter
            const urlWithLocation = `${categoryUrl}?zip=${this.zipCode}`;
            logger.info(`Trying URL with location parameter: ${urlWithLocation}`);
            
            await this.page.goto(urlWithLocation, {
              waitUntil: 'networkidle2',
              timeout: 30000
            });
          }
        } catch (fallbackError) {
          logger.warn(`Fallback navigation failed: ${fallbackError.message}`);
          // Final fallback
          await this.page.goto(categoryUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
        }
      }
      
      // Wait for page to load and location to be applied
      await new Promise(resolve => setTimeout(resolve, this.delay));
      
      // Verify location is applied on category page and check actual product count
      const categoryLocationCheck = await this.page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        
        // Check for zip code in page content
        const hasZipCode = bodyText.includes('80031') || bodyText.includes('delivery zip code: 80031');
        
        // Try to find the actual product count on the page
        const productCountElements = document.querySelectorAll('*');
        let displayedCount = null;
        
        for (const element of productCountElements) {
          const text = element.textContent || '';
          // Look for patterns like "56 results" or "showing 1-96 of 56"
          const countMatch = text.match(/(\d+)\s*results?/i) || 
                           text.match(/of\s+(\d+)/i) ||
                           text.match(/showing.*?(\d+)\s*products?/i);
          if (countMatch) {
            displayedCount = parseInt(countMatch[1]);
            break;
          }
        }
        
        return {
          hasZipCode,
          url: window.location.href,
          displayedCount,
          hasDeliveryText: bodyText.includes('delivery')
        };
      });
      
      logger.info(`Location check on ${categoryName} page:`, categoryLocationCheck);
      
      // Phase 1: Extract product URLs from category listing pages
      const productUrls = [];
      let pageNum = 1;
      const maxPagesPerCategory = 5; // Limit pages per category for Phase 1
      
      while (pageNum <= maxPagesPerCategory) {
        logger.info(`Extracting product URLs from ${categoryName} - page ${pageNum}`);
        
        const pageUrls = await this.extractProductUrlsFromPage();
        
        if (pageUrls.length === 0) {
          logger.info(`No product URLs found on page ${pageNum} of ${categoryName}`);
          break;
        }
        
        productUrls.push(...pageUrls);
        logger.info(`Found ${pageUrls.length} product URLs on page ${pageNum} of ${categoryName}`);
        
        // Check for next page using Costco's pagination structure
        const hasNextPage = await this.page.evaluate(() => {
          // Look for the "forward" li element that contains the next page link
          const forwardElement = document.querySelector('li.forward');
          if (forwardElement) {
            const nextLink = forwardElement.querySelector('a[href*="currentPage="]');
            return nextLink !== null;
          }
          
          // Fallback: look for any pagination link with currentPage parameter
          const paginationLinks = document.querySelectorAll('a[href*="currentPage="]');
          return paginationLinks.length > 0;
        });
        
        if (!hasNextPage) {
          logger.info(`No more pages in ${categoryName}`);
          break;
        }
        
        // Navigate to next page using Costco's pagination structure
        try {
          const nextClicked = await this.page.evaluate(() => {
            // Look for the "forward" li element and click its link
            const forwardElement = document.querySelector('li.forward');
            if (forwardElement) {
              const nextLink = forwardElement.querySelector('a[href*="currentPage="]');
              if (nextLink) {
                nextLink.click();
                return true;
              }
            }
            
            // Fallback: find the next sequential page number
            const currentPageElement = document.querySelector('li.page.selected a');
            if (currentPageElement) {
              const currentPageText = currentPageElement.textContent.trim();
              const currentPageNumber = parseInt(currentPageText);
              const nextPageNumber = currentPageNumber + 1;
              
              // Look for the next page link
              const nextPageLink = document.querySelector(`a[href*="currentPage=${nextPageNumber}"]`);
              if (nextPageLink) {
                nextPageLink.click();
                return true;
              }
            }
            
            return false;
          });
          
          if (nextClicked) {
            // Wait for navigation with longer timeout and error handling
            try {
              await Promise.race([
                this.page.waitForNavigation({ 
                  waitUntil: 'networkidle2', 
                  timeout: 15000 
                }),
                new Promise(resolve => setTimeout(resolve, this.delay * 2))
              ]);
              pageNum++;
              logger.info(`Successfully navigated to page ${pageNum} of ${categoryName}`);
            } catch (navError) {
              logger.warn(`Navigation timeout on page ${pageNum} of ${categoryName}, but continuing...`);
              await new Promise(resolve => setTimeout(resolve, this.delay));
              pageNum++;
            }
          } else {
            break;
          }
        } catch (clickError) {
          logger.error(`Failed to click next page in ${categoryName}:`, clickError.message);
          break;
        }
      }
      
      logger.info(`Found ${productUrls.length} product URLs in ${categoryName}`);
      
      // Phase 2: Extract detailed product data from individual product pages
      const categoryProducts = [];
      let totalProductsProcessed = 0;
      const maxProductsPerCategory = 200; // Increased limit to test full pagination (96 products per page * 2+ pages)
      const urlsToProcess = productUrls.slice(0, maxProductsPerCategory);
      
      for (let i = 0; i < urlsToProcess.length; i++) {
        const productUrl = urlsToProcess[i];
        logger.info(`Processing product ${i + 1}/${urlsToProcess.length}: ${productUrl}`);
        
        try {
          const productData = await this.extractProductDataFromDetailPage(productUrl, categoryName);
          
          if (productData) {
            categoryProducts.push(productData);
            totalProductsProcessed++;
            
            // Save products in batches of 10 to avoid connection timeouts
            if (categoryProducts.length % 10 === 0) {
              logger.info(`Saving batch of ${categoryProducts.length} products...`);
              try {
                const batchResults = await this.saveProducts(categoryProducts);
                // Accumulate statistics from batch saves
                if (this.totalStats) {
                  this.totalStats.added += batchResults.added;
                  this.totalStats.updated += batchResults.updated;
                  this.totalStats.errors += batchResults.errors;
                }
                logger.info(`Successfully saved batch of ${categoryProducts.length} products`);
                categoryProducts.length = 0; // Clear the array after successful save
              } catch (saveError) {
                logger.error(`Failed to save batch:`, saveError.message);
                // Continue processing but keep products in array for later retry
              }
            }
          }
          
          // Small delay between product pages
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Failed to extract data from product URL ${productUrl}:`, error.message);
          
          // Try to recover from navigation errors by refreshing the page context
          try {
            await this.page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
            await new Promise(resolve => setTimeout(resolve, this.delay));
          } catch (reloadError) {
            logger.warn(`Failed to reload page after error, continuing with next product...`);
          }
          continue;
        }
      }
      
      // Save any remaining products
      if (categoryProducts.length > 0) {
        logger.info(`Saving final batch of ${categoryProducts.length} products...`);
        try {
          const finalResults = await this.saveProducts(categoryProducts);
          // Accumulate statistics from final batch
          if (this.totalStats) {
            this.totalStats.added += finalResults.added;
            this.totalStats.updated += finalResults.updated;
            this.totalStats.errors += finalResults.errors;
          }
        } catch (saveError) {
          logger.error(`Failed to save final batch:`, saveError.message);
        }
      }
      
      logger.info(`Completed scraping ${categoryName}: ${totalProductsProcessed} products processed`);
      return { totalProducts: totalProductsProcessed, remainingProducts: categoryProducts };
      
    } catch (error) {
      logger.error(`Error scraping category ${categoryName}:`, error);
      return [];
    }
  }

  async extractProductUrlsFromPage() {
    return await this.page.evaluate(() => {
      const productUrls = [];
      
      // Enhanced product selectors for finding links
      const productSelectors = [
        '[class*="product-tile"] a',
        '[data-automation-id="productTile"] a',
        '.product-tile a',
        '.product-item a',
        '.product-card a',
        '[class*="product"] a'
      ];
      
      let productLinks = [];
      let usedSelector = '';
      
      // Try each selector until we find product links
      for (const selector of productSelectors) {
        try {
          const links = document.querySelectorAll(selector);
          productLinks = Array.from(links).filter(link => {
            const href = link.href;
            // Must be a native Costco product URL and not a category, redirect, or ad
            return href && 
              href.startsWith('https://www.costcobusinessdelivery.com') &&
              (href.includes('.product.') || href.includes('/p/') || href.includes('product')) &&
              !href.includes('#') &&
              !href.includes('criteo.com') &&
              !href.includes('redirect') &&
              !href.includes('b.da.us') &&
              !href.includes('rm?dest=');
          });
          
          if (productLinks.length > 0) {
            usedSelector = selector;
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      console.log(`Found ${productLinks.length} product links with selector: ${usedSelector}`);
      
      // Extract unique URLs and filter out redirects
      const uniqueUrls = new Set();
      productLinks.forEach(link => {
        if (link.href) {
          // Only include native Costco URLs, exclude redirects and ads
          if (link.href.startsWith('https://www.costcobusinessdelivery.com') &&
              !link.href.includes('criteo.com') &&
              !link.href.includes('redirect') &&
              !link.href.includes('b.da.us') &&
              !link.href.includes('rm?dest=')) {
            uniqueUrls.add(link.href);
          }
        }
      });
      
      return Array.from(uniqueUrls);
    });
  }

  async extractProductDataFromDetailPage(productUrl, categoryName) {
    try {
      await this.page.goto(productUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for page to load with error handling
      await new Promise(resolve => setTimeout(resolve, this.delay));
      
      // Extract product data from window.digitalData.product
      const productData = await this.page.evaluate((category) => {
        try {
          // Check if digitalData exists and has product info
          if (!window.digitalData || !window.digitalData.product) {
            console.log('No digitalData.product found on page');
            return null;
          }
          
          const product = Array.isArray(window.digitalData.product) 
            ? window.digitalData.product[0] 
            : window.digitalData.product;
          
          if (!product) {
            console.log('Product data is empty');
            return null;
          }
          
          // Extract and validate required fields
          const name = product.name?.trim();
          const price = parseFloat(product.priceMin || product.priceMax || 0);
          const productId = product.pid || product.id;
          const sku = product.sku || product.itemNumber;
          
          if (!name || !price || price <= 0) {
            console.log(`Incomplete product data: name=${name}, price=${price}`);
            return null;
          }
          
          return {
            costco_product_id: productId,
            name: name,
            url: window.location.href,
            price: price,
            category: category,
            sku: sku,
            inventory_status: product.inventoryStatus,
            membership_required: product.membershipReq === 'member-only'
          };
          
        } catch (error) {
          console.error('Error extracting product data from digitalData:', error);
          return null;
        }
      }, categoryName);
      
      return productData;
      
    } catch (error) {
      logger.error(`Error extracting product data from ${productUrl}:`, error);
      return null;
    }
  }

  async scrapeProducts() {
    logger.info('Starting category-based product scraping...');
    
    const allProducts = [];
    
    try {
      // Get all grocery categories
      const categories = await this.getGroceryCategories();
      
      if (categories.length === 0) {
        logger.warn('No grocery categories found, falling back to current page scraping');
        // Fallback: scrape products from current page
        const currentPageProducts = await this.extractProductsFromPage('Grocery');
        return currentPageProducts;
      }
      
      logger.info(`Found ${categories.length} categories to scrape`);
      
      // Scrape each category
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        logger.info(`Processing category ${i + 1}/${categories.length}: ${category.name}`);
        
        try {
          const categoryResult = await this.scrapeCategory(category.url, category.name);
          
          // Handle both old array format and new object format for backward compatibility
          const categoryProducts = Array.isArray(categoryResult) ? categoryResult : categoryResult.remainingProducts;
          const totalProcessed = Array.isArray(categoryResult) ? categoryResult.length : categoryResult.totalProducts;
          
          if (categoryProducts.length > 0) {
            allProducts.push(...categoryProducts);
          }
          
          if (totalProcessed > 0) {
            logger.info(`Processed ${totalProcessed} products from ${category.name}. Remaining products in memory: ${categoryProducts.length}. Total so far: ${allProducts.length}`);
          } else {
            logger.warn(`No products found in category: ${category.name}`);
          }
          
          // Small delay between categories to be respectful
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          logger.error(`Failed to scrape category ${category.name}:`, error);
          // Continue with next category
          continue;
        }
      }
      
      logger.info(`Completed category-based scraping. Total products: ${allProducts.length}`);
      return allProducts;
      
    } catch (error) {
      logger.error('Error in category-based scraping:', error);
      
      // Fallback: try to scrape products from current page
      logger.info('Attempting fallback scraping from current page');
      try {
        const fallbackProducts = await this.extractProductsFromPage('Grocery');
        logger.info(`Fallback scraping found ${fallbackProducts.length} products`);
        return fallbackProducts;
      } catch (fallbackError) {
        logger.error('Fallback scraping also failed:', fallbackError);
        return [];
      }
    }
  }

  async saveProducts(products) {
    console.log('Saving products to database...');
    
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      try {
        // Ensure database connection before each operation
        await this.db.ensureConnection();
        
        const result = await this.db.upsertProduct(product);
        
        if (result.isNew) {
          added++;
        } else {
          updated++;
        }
        
        // Add price history
        await this.db.addPriceHistory(result.id, product.price);
        
        // Log progress every 10 products
        if ((i + 1) % 10 === 0) {
          console.log(`Saved ${i + 1}/${products.length} products to database`);
        }
        
      } catch (error) {
        console.error('Error saving product:', product.name, error.message);
        errors++;
        
        // Try to reconnect database on connection errors
        if (error.message.includes('Connection terminated') || 
            error.message.includes('connection') ||
            error.message.includes('timeout')) {
          try {
            console.log('Attempting to reconnect database...');
            await this.db.connect();
          } catch (reconnectError) {
            console.error('Failed to reconnect database:', reconnectError.message);
          }
        }
      }
    }
    
    console.log(`Products saved: ${added} added, ${updated} updated, ${errors} errors`);
    return { added, updated, errors };
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed');
    }
    
    await this.db.disconnect();
    console.log('Database disconnected');
  }

  async scrape() {
    const jobId = await this.db.createJob();
    logger.jobStart(jobId);
    
    // Track cumulative statistics across all save operations
    this.totalStats = {
      added: 0,
      updated: 0,
      errors: 0
    };
    
    try {
      await this.init();
      await this.setLocation();
      
      // Clear any existing location cache
      await this.page.evaluate(() => {
        // Clear localStorage and sessionStorage that might cache location
        localStorage.clear();
        sessionStorage.clear();
      });
      
      const products = await this.scrapeProducts();
      const saveResults = await this.saveProducts(products);
      
      // Add final save results to cumulative totals
      this.totalStats.added += saveResults.added;
      this.totalStats.updated += saveResults.updated;
      this.totalStats.errors += saveResults.errors;
      
      await this.db.updateJob(jobId, {
        status: 'completed',
        products_scraped: this.totalStats.added + this.totalStats.updated,
        products_added: this.totalStats.added,
        products_updated: this.totalStats.updated
      });
      
      const stats = {
        jobId,
        productsScraped: this.totalStats.added + this.totalStats.updated,
        productsAdded: this.totalStats.added,
        productsUpdated: this.totalStats.updated
      };
      
      logger.jobComplete(jobId, stats);
      return stats;
      
    } catch (error) {
      logger.jobFailed(jobId, error);
      
      await this.db.updateJob(jobId, {
        status: 'failed',
        error_message: error.message
      });
      
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

module.exports = CostcoScraper;
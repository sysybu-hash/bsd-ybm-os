import { test, expect } from '@playwright/test';

test.describe('Site Quality', () => {
  test('should load the homepage', async ({ page }) => {
    // Go to the homepage
    await page.goto('/');

    // Check if the page loads (e.g., has a body or a specific element)
    await expect(page.locator('body')).toBeVisible();
    
    // Check if it redirects to login or shows the landing page
    // Since we are not logged in, it might show a login button or redirect
    const title = await page.title();
    console.log('Page title:', title);
  });

  test('should have no critical console errors', async ({ page }) => {
    const criticalErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore 401 Unauthorized errors as they are expected when not logged in
        if (!text.includes('401 (Unauthorized)')) {
          criticalErrors.push(text);
        }
      }
    });

    await page.goto('/');
    
    // Wait for some time to catch any async errors
    await page.waitForTimeout(2000);
    
    expect(criticalErrors).toEqual([]);
  });
});

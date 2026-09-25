import { expect, test } from '@playwright/test'

test('the playground runs the starter program', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByTestId('run-status')).toContainText('output', { timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Run' })).toBeEnabled()
})

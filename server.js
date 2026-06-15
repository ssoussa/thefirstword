name: Send Weekly Emails

on:
  schedule:
    # Every Monday at 8:00 AM Eastern (13:00 UTC)
    - cron: '0 13 * * 1'
  workflow_dispatch: # Allow manual trigger for testing

jobs:
  send-emails:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger weekly email batch
        run: |
          response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST https://thefirstword.ca/api/send-weekly-batch \
            -H "Content-Type: application/json" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            --max-time 60)
          echo "Response code: $response"
          if [ "$response" != "200" ]; then
            echo "Failed with status $response"
            exit 1
          fi
          echo "Weekly emails sent successfully"

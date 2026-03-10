import os
import subprocess
import sys

def setup_cron():
    # Get absolute path to the scripts
    script_dir = os.path.dirname(os.path.abspath(__file__))
    daily_script = os.path.join(script_dir, "daily_update.sh")
    tenmin_script = os.path.join(script_dir, "10min_update.sh")
    
    # Ensure they are executable
    os.chmod(daily_script, 0o755)
    if os.path.exists(tenmin_script):
        os.chmod(tenmin_script, 0o755)
    
    # Log file paths
    project_root = os.path.dirname(script_dir)
    daily_log = os.path.join(project_root, "logs", "cron_update.log")
    tenmin_log = os.path.join(project_root, "logs", "cron_10min.log")
    
    # Create logs dir
    os.makedirs(os.path.dirname(daily_log), exist_ok=True)
    
    # Cron commands
    daily_schedule = "0 7 * * *"
    daily_cmd = f"{daily_script} >> {daily_log} 2>&1"
    daily_cron_line = f"{daily_schedule} {daily_cmd}"
    
    tenmin_schedule = "*/10 * * * *"
    tenmin_cmd = f"{tenmin_script} >> {tenmin_log} 2>&1"
    tenmin_cron_line = f"{tenmin_schedule} {tenmin_cmd}"
    
    print(f"Preparing to add cron jobs:\n{daily_cron_line}\n{tenmin_cron_line}")
    
    # Read current crontab
    try:
        current_crontab = subprocess.check_output(["crontab", "-l"], stderr=subprocess.DEVNULL).decode("utf-8")
    except subprocess.CalledProcessError:
        current_crontab = ""
        
    try:
        new_crontab = current_crontab.strip()
        
        added_any = False
        
        # Check daily
        if daily_script not in new_crontab:
            new_crontab += "\n" + daily_cron_line
            added_any = True
        else:
            print("Daily cron job already exists. Skipping.")
            
        # Check 10min
        if tenmin_script not in new_crontab and os.path.exists(tenmin_script):
            new_crontab += "\n" + tenmin_cron_line
            added_any = True
        else:
            print("10-Minute cron job already exists (or script missing). Skipping.")
        
        if not added_any:
            return
            
        new_crontab += "\n"
        
        # Write back
        process = subprocess.Popen(["crontab", "-"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate(input=new_crontab)
        
        if process.returncode == 0:
            print("Successfully updated cron jobs!")
            print("To verify, run: crontab -l")
        else:
            print(f"Error updating crontab: {stderr}")

    except FileNotFoundError:
        print("\n[!] The 'crontab' command was not found on this system.")
        print("You can manually schedule the update by adding these lines to your scheduler:")
        print(f"\n{daily_cron_line}")
        print(f"{tenmin_cron_line}\n")
            
    except Exception as e:
        print(f"Failed to configure crontab automatically: {e}")

if __name__ == "__main__":
    setup_cron()

import os

def fix_file(path, replacements):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    changed = False
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            changed = True
            print(f"Applied replacement in {os.path.basename(path)}: {old[:20]}...")
        else:
            print(f"Could not find target in {os.path.basename(path)}: {old[:20]}...")
    
    if changed:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(content)
        print(f"Saved changes to {os.path.basename(path)}")
    else:
        print(f"No changes made to {os.path.basename(path)}")

# Fix stocks.py
stocks_path = r'C:\Users\KRISH\Desktop\Finance\backend\app\api\v1\endpoints\stocks.py'
stocks_replacements = [
    ('simplified = " ".join(chunks[:2]).strip()', 'simplified = " ".join(cast(Any, chunks)[:2]).strip()'),
    ('round(total, 2)', 'round(float(total), 2)'),
    ('round(value, 2)', 'round(float(value), 2)')
]
fix_file(stocks_path, stocks_replacements)

# Fix dashboard.py
dashboard_path = r'C:\Users\KRISH\Desktop\Finance\backend\app\services\dashboard.py'
dashboard_replacements = [
    ('data["price"]["cmp"] = round(close, 2)', 'data["price"]["cmp"] = round(float(close), 2)'),
    ('data["price"]["change"] = round(close - previous, 2)', 'data["price"]["change"] = round(float(close - previous), 2)'),
    ('data["price"]["changePercent"] = round(((close - previous) / previous) * 100, 2)', 'data["price"]["changePercent"] = round(float(((close - previous) / previous) * 100), 2)')
]
fix_file(dashboard_path, dashboard_replacements)

# Fix providers.py
providers_path = r'C:\Users\KRISH\Desktop\Finance\backend\app\services\providers.py'
providers_replacements = [
    ('return results[:n]', 'return cast(list[Any], results)[:n]'),
    ('return results[:50]', 'return cast(list[Any], results)[:50]')
]
fix_file(providers_path, providers_replacements)

print("Backend hardening script completed.")

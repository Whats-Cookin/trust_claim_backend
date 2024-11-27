def clean_file(input_file, output_file):
    with open(input_file, 'r') as f:
        lines = f.readlines()
    
    cleaned_records = []
    current_record = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # If line starts with a number, it's a new record
        if line[0].isdigit():
            if current_record:
                cleaned_records.append(current_record)
            current_record = line
        else:
            # It's a continuation of previous description
            if current_record:
                current_record = current_record.rstrip() + " " + line

    # Don't forget the last record
    if current_record:
        cleaned_records.append(current_record)
        
    with open(output_file, 'w') as f:
        for record in cleaned_records:
            f.write(record + '\n')

# Clean each file
clean_file('./fixture_data/nodes.txt', './fixture_data/nodes_clean.txt')
clean_file('./fixture_data/edges.txt', './fixture_data/edges_clean.txt')
clean_file('./fixture_data/claims.txt', './fixture_data/claims_clean.txt')

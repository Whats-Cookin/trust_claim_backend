def create_insert_statements(input_file, output_file):
    current_table = None
    header = None
    data = []
    
    with open(input_file, 'r') as f:
        lines = f.readlines()
        
    with open(output_file, 'w') as f:
        f.write('BEGIN;\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if line == 'NODES:|':
                current_table = 'Node'
                header = None
                continue
            elif line == 'EDGES:|':
                current_table = 'Edge'
                header = None
                continue
            elif line == 'CLAIMS:|':
                current_table = 'Claim'
                header = None
                continue
                
            if header is None:
                header = line.split('|')
                continue
                
            values = line.split('|')
            columns = ','.join(f'"{h}"' for h in header)
            value_list = ','.join(
                'NULL' if v == '\\N' or v == '' 
                else f"'{v}'" if not v.replace('.','').replace('-','').replace('+','').isdigit() 
                else v 
                for v in values
            )
            f.write(f'INSERT INTO "{current_table}" ({columns}) VALUES ({value_list});\n')
        
        f.write('COMMIT;\n')

create_insert_statements('fixture_data.txt', 'insert_fixture.sql')

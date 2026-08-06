-- Migrasi database lama agar setiap siswa dapat mengerjakan
-- satu ujian maksimal 2 kali.
-- Migrasi ini tidak menghapus riwayat nilai yang sudah ada.

DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_exam_attempts_to_multi_attempt$$

CREATE PROCEDURE migrate_exam_attempts_to_multi_attempt()
BEGIN
  DECLARE finished INT DEFAULT 0;
  DECLARE unique_index_name VARCHAR(128);
  DECLARE supporting_index_exists INT DEFAULT 0;

  DECLARE unique_index_cursor CURSOR FOR
    SELECT candidate.index_name
    FROM (
      SELECT
        index_name,
        MAX(non_unique) AS non_unique_value,
        GROUP_CONCAT(
          column_name
          ORDER BY seq_in_index
          SEPARATOR ','
        ) AS columns_list
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'exam_attempts'
        AND index_name <> 'PRIMARY'
      GROUP BY index_name
      HAVING non_unique_value = 0
        AND columns_list IN (
          'exam_id,user_id',
          'user_id,exam_id'
        )
    ) AS candidate;

  DECLARE CONTINUE HANDLER
    FOR NOT FOUND SET finished = 1;

  OPEN unique_index_cursor;

  remove_unique_indexes: LOOP
    FETCH unique_index_cursor INTO unique_index_name;

    IF finished = 1 THEN
      LEAVE remove_unique_indexes;
    END IF;

    SET @drop_index_sql = CONCAT(
      'ALTER TABLE exam_attempts DROP INDEX `',
      REPLACE(unique_index_name, '`', '``'),
      '`'
    );

    PREPARE drop_index_statement
    FROM @drop_index_sql;

    EXECUTE drop_index_statement;

    DEALLOCATE PREPARE drop_index_statement;
  END LOOP;

  CLOSE unique_index_cursor;

  SELECT COUNT(*)
  INTO supporting_index_exists
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'exam_attempts'
    AND index_name = 'idx_attempts_exam_user_id';

  IF supporting_index_exists = 0 THEN
    ALTER TABLE exam_attempts
      ADD INDEX idx_attempts_exam_user_id (
        exam_id,
        user_id,
        id
      );
  END IF;
END$$

CALL migrate_exam_attempts_to_multi_attempt()$$

DROP PROCEDURE migrate_exam_attempts_to_multi_attempt$$

DELIMITER ;
package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Enroll;

/**
 * 选修(选课) 数据访问对象(DAO)。
 *
 * <p>封装 enroll 表的操作。enroll 表体现学生与课程之间的 m:n 联系，
 * 复合主键为 (学号, 课程号)。查询方法通过联表带出学生姓名与课程名，
 * 方便界面展示。</p>
 */
public class EnrollDao {

    /**
     * 查询所有选课记录（联表带出姓名、课程名）。
     *
     * @return 选课记录列表
     */
    public List<Enroll> findAll() {
        List<Enroll> list = new ArrayList<>();
        String sql = "SELECT e.stu_id, s.stu_name, e.course_id, c.course_name, e.score "
                + "FROM enroll e "
                + "JOIN student s ON s.stu_id = e.stu_id "
                + "JOIN course c ON c.course_id = e.course_id "
                + "ORDER BY e.stu_id, e.course_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询选课记录失败", e);
        }
        return list;
    }

    /**
     * 新增/录入一条选课记录（含成绩）。
     *
     * @param e 选课实体
     * @return 影响行数
     */
    public int insert(Enroll e) {
        String sql = "INSERT INTO enroll(stu_id, course_id, score) VALUES(?, ?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, e.getStuId());
            ps.setString(2, e.getCourseId());
            if (e.getScore() == null) {
                ps.setNull(3, java.sql.Types.DOUBLE);
            } else {
                ps.setDouble(3, e.getScore());
            }
            return ps.executeUpdate();
        } catch (Exception ex) {
            throw new RuntimeException("录入选课失败（该生可能已选此课）", ex);
        }
    }

    /**
     * 更新一条选课记录的成绩。
     *
     * @param e 含学号、课程号与成绩的选课实体
     * @return 影响行数
     */
    public int updateScore(Enroll e) {
        String sql = "UPDATE enroll SET score = ? WHERE stu_id = ? AND course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            if (e.getScore() == null) {
                ps.setNull(1, java.sql.Types.DOUBLE);
            } else {
                ps.setDouble(1, e.getScore());
            }
            ps.setString(2, e.getStuId());
            ps.setString(3, e.getCourseId());
            return ps.executeUpdate();
        } catch (Exception ex) {
            throw new RuntimeException("更新成绩失败", ex);
        }
    }

    /**
     * 删除一条选课记录（退选）。
     *
     * @param stuId    学号
     * @param courseId 课程号
     * @return 影响行数
     */
    public int delete(String stuId, String courseId) {
        String sql = "DELETE FROM enroll WHERE stu_id = ? AND course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, stuId);
            ps.setString(2, courseId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("退选失败", e);
        }
    }

    /**
     * 统计每门课程的选修人数（按课程分组）。
     *
     * @return 每行以 Object[] 表示 [courseId, courseName, count]
     */
    public List<Object[]> statCourseCount() {
        List<Object[]> list = new ArrayList<>();
        String sql = "SELECT c.course_id, c.course_name, COUNT(e.stu_id) AS cnt "
                + "FROM course c "
                + "LEFT JOIN enroll e ON e.course_id = c.course_id "
                + "GROUP BY c.course_id, c.course_name "
                + "ORDER BY cnt DESC";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(new Object[]{
                        rs.getString("course_id"),
                        rs.getString("course_name"),
                        rs.getInt("cnt")
                });
            }
        } catch (Exception e) {
            throw new RuntimeException("统计选修人数失败", e);
        }
        return list;
    }

    /**
     * 统计每个班级的选课总人次（用于展示多表统计）。
     *
     * @return 每行以 Object[] 表示 [className, enrollCount]
     */
    public List<Object[]> statClassEnroll() {
        List<Object[]> list = new ArrayList<>();
        String sql = "SELECT cl.class_name, COUNT(e.stu_id) AS cnt "
                + "FROM clazz cl "
                + "JOIN student s ON s.class_id = cl.class_id "
                + "JOIN enroll e ON e.stu_id = s.stu_id "
                + "GROUP BY cl.class_name ORDER BY cnt DESC";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(new Object[]{
                        rs.getString("class_name"),
                        rs.getInt("cnt")
                });
            }
        } catch (Exception e) {
            throw new RuntimeException("统计班级选课失败", e);
        }
        return list;
    }

    private Enroll mapRow(ResultSet rs) throws Exception {
        Enroll e = new Enroll();
        e.setStuId(rs.getString("stu_id"));
        e.setStuName(rs.getString("stu_name"));
        e.setCourseId(rs.getString("course_id"));
        e.setCourseName(rs.getString("course_name"));
        double score = rs.getDouble("score");
        e.setScore(rs.wasNull() ? null : score);
        return e;
    }
}
